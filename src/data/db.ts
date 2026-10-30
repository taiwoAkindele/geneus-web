import { activeWorkspace } from './facilityWorkspaces';
import {
  parseDocument,
  SCHEMA_VERSION,
  type AnyDocument,
  type AuthorizationContext,
  type DocType,
  type Permission,
} from '@shared';
import { assertAllowed } from '@/auth/authorization';
import { fieldKindsFor } from './contractShape';
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

const assertFacilityContext = (context: AuthorizationContext, record?: AnyDocument) => {
  const workspace = activeWorkspace();
  if (workspace && (workspace.facilityId !== context.facilityId || workspace.deviceId !== context.deviceId)) throw new Error('The signed-in context belongs to another facility workspace');
  if (record && record.facilityId !== context.facilityId) throw new Error('A record cannot be written into another facility');
};
const placeholders = (count: number): string => Array.from({ length: count }, () => '?').join(', ');

/**
 * A column name as SQL. Always quoted: contract field names are not chosen
 * with SQL in mind, and one that is a keyword (`values`, on register and
 * encounter entries) is a syntax error unquoted.
 */
const column = (name: string): string => `"${name}"`;

/**
 * Creates a record. `permission` is checked first; then the contract; then the
 * row is inserted, which is what PowerSync queues as a PUT.
 */
export const insertRecord = async <T extends AnyDocument>(
  context: AuthorizationContext,
  permission: Permission,
  type: DocType,
  record: unknown,
  options?:{replaceSame?:boolean},
): Promise<T> => {
  assertAllowed(context, permission);
  assertFacilityContext(context);
  const {prepareClinicalBundle,clearClinicalReview}=await import('./repos/clinicalReviews');
  const bundle=await prepareClinicalBundle([{type,permission,record:validate(record)}],context);
  const validated = validate<T>(bundle.records[0].record);
  assertFacilityContext(context, validated);
  const row = toRow(type, validated);
  if(options?.replaceSame){const existing=await findRecord(type,validated.id);if(existing){const {clinicalPayloadHash}=await import('./workforceClinical');if(await clinicalPayloadHash(existing)!==await clinicalPayloadHash(validated))throw new Error('A different clinical record already uses this identity. Review its existing history');}}
  const columns = Object.keys(row);
  await getDatabase().execute(
    `INSERT ${options?.replaceSame?'OR REPLACE ':''}INTO ${TABLE_FOR[type]} (${columns.map(column).join(', ')}) VALUES (${placeholders(columns.length)})`,
    columns.map((column) => row[column]),
  );
  if(bundle.reviewId)await clearClinicalReview(bundle.reviewId);
  return validated;
};

export type NewRecord = { permission: Permission; type: DocType; record: unknown };

/**
 * Creates several records that only make sense together — an encounter and
 * its first saved step. Every permission and every record is checked before
 * the first INSERT, so a refusal or a contract failure writes none of them.
 */
export const insertRecords = async (context: AuthorizationContext, records: readonly NewRecord[]): Promise<AnyDocument[]> => {
  assertFacilityContext(context);
  for (const { permission } of records) assertAllowed(context, permission);
  const {prepareClinicalBundle,clearClinicalReview}=await import('./repos/clinicalReviews');
  const bundle=await prepareClinicalBundle(records.map((r)=>({...r,record:validate(r.record)})),context);
  const validated=bundle.records.map(({type,record})=>({type,record:validate(record)}));
  for (const { record } of validated) assertFacilityContext(context, record);
  await getDatabase().writeTransaction(async (transaction) => {
    for (const { type, record } of validated) {
      const row = toRow(type, record);
      const columns = Object.keys(row);
      await transaction.execute(
        `INSERT INTO ${TABLE_FOR[type]} (${columns.map(column).join(', ')}) VALUES (${placeholders(columns.length)})`,
        columns.map((column) => row[column]),
      );
    }
  });
  if(bundle.reviewId)await clearClinicalReview(bundle.reviewId);
  return validated.map(({ record }) => record);
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
  changedOn = nowIso(),
): Promise<T> => {
  assertAllowed(context, permission);
  const current = await findRecord<T>(type, id);
  if (!current) throw new Error(`no ${type} ${id} to change`);
  const stamped = { ...changes, updatedBy: context.userId, updatedOn: changedOn };
  const merged = validate<T>({ ...current, ...stamped });
  assertFacilityContext(context, merged);
  const revision = (changes as Record<string, unknown>).revision;
  const cas = typeof revision === 'number' && ['unit','billing_department','location','service_definition','service_offering','practitioner_profile'].includes(type);
  if (cas && revision !== Number((current as Record<string,unknown>).revision ?? 1) + 1) throw new Error('This configuration changed. Reopen the current record before saving');
  const row = toRow(type, stamped);
  const columns = Object.keys(row);
  // `_metadata` is PowerSync's per-write note, not a contract field: it carries the
  // actor even when `updatedBy` is unchanged and therefore absent from the PATCH.
  const statement=`UPDATE ${TABLE_FOR[type]} SET ${columns.map((name)=>`${column(name)} = ?`).join(', ')}, _metadata = ? WHERE id = ?${cas?' AND COALESCE("revision", 1) = ?':''}`;
  const parameters=[...columns.map((name)=>row[name]),context.userId,id,...(cas?[revision-1]:[])];
  if(cas){
    // PowerSync tables are SQLite views: INSTEAD OF triggers legitimately return
    // rowsAffected=0. Check the revision under the same write lock as the update.
    await getDatabase().writeTransaction(async(transaction)=>{
      const locked=await transaction.getOptional<{revision?:number}>(`SELECT revision FROM ${TABLE_FOR[type]} WHERE id = ?`,[id]);
      if(!locked||Number(locked.revision??1)!==revision-1)throw new Error('This configuration changed in another window. Reopen its current details before saving');
      await transaction.execute(statement,parameters);
    });
  }else await getDatabase().execute(statement,parameters);
  return merged;
};

export const allOfType = async <T extends AnyDocument>(type: DocType): Promise<T[]> => {
  const rows = await getDatabase().getAll<Row>(`SELECT * FROM ${TABLE_FOR[type]}`);
  return rows.map((row) => fromRow<T>(type, row));
};

/**
 * Records whose `field` equals `value` — for tables that grow every day, where
 * reading and parsing the whole table on each change would be too slow on a
 * cheap phone. `field` must be a contract field of `type`, so nothing else can
 * reach the SQL.
 */
export const allWhere = async <T extends AnyDocument>(type: DocType, field: string, value: string): Promise<T[]> => {
  if (!(field in fieldKindsFor(type))) throw new Error(`${type} has no field ${field}`);
  const rows = await getDatabase().getAll<Row>(`SELECT * FROM ${TABLE_FOR[type]} WHERE ${column(field)} = ?`, [value]);
  return rows.map((row) => fromRow<T>(type, row));
};

export const findRecord = async <T extends AnyDocument>(type: DocType, id: string): Promise<T | undefined> => {
  const row = await getDatabase().getOptional<Row>(`SELECT * FROM ${TABLE_FOR[type]} WHERE id = ?`, [id]);
  return row ? fromRow<T>(type, row) : undefined;
};

/** Fires whenever local data changes, including changes pulled in by sync. */
export const onChange = (listener: () => void): (() => void) =>
  getDatabase().onChangeWithCallback({ onChange: listener }, { tables: [...ALL_TABLES] });
