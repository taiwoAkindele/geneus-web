import {
  parseDocument,
  SCHEMA_VERSION,
  type AnyDocument,
  type AuthorizationContext,
  type DocType,
  type Permission,
} from '@shared';
import { assertAllowed } from '@/auth/authorization';
import { getDatabase } from './database';
import { fromRow, toRow, type Row } from './rows';
import { ALL_TABLES, TABLE_FOR } from './tables';

/**
 * The device's local database — the app's source of truth while offline.
 * Writes land here first and return immediately; PowerSync carries them up
 * when there is signal. Only `src/data` may import this module; repositories
 * are the write boundary.
 *
 * Every write goes: authorization → contract validation → SQLite. A denial
 * throws before anything is written, so PowerSync has nothing to upload
 * (root §4.3, migration plan §15).
 */
export { AuthorizationError } from '@/auth/authorization';

/** Thrown when a record fails the shared contract; never write past this. */
export class ContractError extends Error {
  constructor(readonly issues: string[]) {
    super(`Record rejected by the shared contract: ${issues.join('; ')}`);
    this.name = 'ContractError';
  }
}

export const nowIso = (): string => new Date().toISOString();
export const todayIso = (): string => nowIso().slice(0, 10);

/** Random so ids minted on two offline devices never collide (root §4.2). */
export const newId = (type: DocType): string =>
  `${type}:${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

/** Facility, device and staff identity are stamped on every record (SCHEMA.md §2). */
export const envelope = (context: AuthorizationContext, createdOn = nowIso()) => ({
  facilityId: context.facilityId,
  deviceId: context.deviceId,
  createdBy: context.userId,
  createdOn,
  schemaVersion: SCHEMA_VERSION,
});

const validate = <T extends AnyDocument>(record: unknown): T => {
  const result = parseDocument(record);
  if (!result.success) {
    throw new ContractError(result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  return result.data as T;
};

const placeholders = (count: number): string => Array.from({ length: count }, () => '?').join(', ');

/**
 * Creates a record. `permission` is checked first; then the contract; then the
 * row is inserted, which is what PowerSync queues as a PUT.
 */
export const insertRecord = async <T extends AnyDocument>(
  context: AuthorizationContext,
  permission: Permission,
  type: DocType,
  record: unknown,
): Promise<T> => {
  assertAllowed(context, permission);
  const validated = validate<T>(record);
  const row = toRow(type, validated);
  const columns = Object.keys(row);
  await getDatabase().execute(
    `INSERT INTO ${TABLE_FOR[type]} (${columns.join(', ')}) VALUES (${placeholders(columns.length)})`,
    columns.map((column) => row[column]),
  );
  return validated;
};

/**
 * Changes some fields of an existing record. Only the changed columns are
 * written (plus who changed them and when), which is what PowerSync queues as
 * a PATCH — and what lets the server merge column by column. The merged record
 * is validated against the contract before anything is written.
 */
export const updateRecord = async <T extends AnyDocument>(
  context: AuthorizationContext,
  permission: Permission,
  type: DocType,
  id: string,
  changes: Partial<T>,
): Promise<T> => {
  assertAllowed(context, permission);
  const current = await findRecord<T>(type, id);
  if (!current) throw new Error(`no ${type} ${id} to change`);
  const stamped = { ...changes, updatedBy: context.userId, updatedOn: nowIso() };
  const merged = validate<T>({ ...current, ...stamped });
  const row = toRow(type, stamped);
  const columns = Object.keys(row);
  await getDatabase().execute(
    `UPDATE ${TABLE_FOR[type]} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE id = ?`,
    [...columns.map((column) => row[column]), id],
  );
  return merged;
};

export const allOfType = async <T extends AnyDocument>(type: DocType): Promise<T[]> => {
  const rows = await getDatabase().getAll<Row>(`SELECT * FROM ${TABLE_FOR[type]}`);
  return rows.map((row) => fromRow<T>(type, row));
};

export const findRecord = async <T extends AnyDocument>(type: DocType, id: string): Promise<T | undefined> => {
  const row = await getDatabase().getOptional<Row>(`SELECT * FROM ${TABLE_FOR[type]} WHERE id = ?`, [id]);
  return row ? fromRow<T>(type, row) : undefined;
};

/** Fires whenever local data changes, including changes pulled in by sync. */
export const onChange = (listener: () => void): (() => void) =>
  getDatabase().onChangeWithCallback({ onChange: listener }, { tables: [...ALL_TABLES] });
