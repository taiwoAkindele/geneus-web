import PouchDB from 'pouchdb-browser';
import { parseDocument, SCHEMA_VERSION, type AnyDocument, type DocType } from '@shared';

/**
 * The device's local replica — the app's source of truth while offline. Writes
 * land here first and return immediately; replication with the facility's
 * CouchDB is added on top later without changing any caller.
 *
 * Only `src/data` may import this module.
 */
export const db: PouchDB.Database<AnyDocument> = new PouchDB('geneus');

/** Facility and device identity are stamped on every document (SCHEMA.md §2). */
export type WriteContext = {
  facilityId: string;
  deviceId: string;
  staffId: string;
  /** False for read-only staff, who may look at records but not record care. */
  canWrite: boolean;
};

export class PermissionError extends Error {
  constructor() {
    super('Your access is read-only — ask a facility admin to change it');
    this.name = 'PermissionError';
  }
}

/**
 * Read-only access is enforced here rather than only in the UI, so a hidden
 * button is a courtesy and this is the actual rule — the same way shift access
 * is enforced on the device (root §4.3).
 */
export const assertCanWrite = (context: WriteContext): void => {
  if (!context.canWrite) throw new PermissionError();
};

/** Thrown when a document fails the shared contract; never write past this. */
export class ContractError extends Error {
  constructor(readonly issues: string[]) {
    super(`Document rejected by the shared contract: ${issues.join('; ')}`);
    this.name = 'ContractError';
  }
}

export const nowIso = (): string => new Date().toISOString();
export const todayIso = (): string => nowIso().slice(0, 10);

/** Random so ids minted on two offline devices never collide (root §4.2). */
export const newId = (type: DocType): string =>
  `${type}:${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;

export const envelope = (context: WriteContext, createdOn = nowIso()) => ({
  facilityId: context.facilityId,
  deviceId: context.deviceId,
  createdBy: context.staffId,
  createdOn,
  schemaVersion: SCHEMA_VERSION,
});

/**
 * The single write path: validate against the contract, then persist. A document
 * written offline may not sync for 7 days, so a bad shape must be caught here
 * rather than at the far end (SCHEMA.md §1).
 */
export const put = async <T extends AnyDocument>(doc: T): Promise<T> => {
  const result = parseDocument(doc);
  if (!result.success) {
    throw new ContractError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const validated = result.data as T;
  const response = await db.put(validated as PouchDB.Core.PutDocument<AnyDocument>);
  return { ...validated, _rev: response.rev };
};

/**
 * Scans the replica and filters on `type`. Ids don't all share a type prefix
 * (a register definition's id is `${registerId}:v${version}`), so a key range
 * would silently miss documents. The replica is deliberately bounded, so a scan
 * is fast enough; revisit if a real facility's data outgrows it.
 */
/**
 * Applies the contract's defaults to a stored document, so one written before a
 * field existed behaves like one written today (SCHEMA.md §7) — without this, a
 * new optional field reads back as `undefined` and silently changes behaviour.
 *
 * Unknown keys are kept rather than stripped: a document may have been written
 * by a device running a newer contract, and reading must never quietly discard
 * what it does not recognise.
 */
const upMigrate = <T extends AnyDocument>(doc: AnyDocument): T => {
  const parsed = parseDocument(doc);
  if (!parsed.success) {
    console.warn(`document ${doc._id} does not match the contract`, parsed.error.issues);
    return doc as T;
  }
  return { ...doc, ...(parsed.data as object) } as T;
};

export const allOfType = async <T extends AnyDocument>(type: DocType): Promise<T[]> => {
  const result = await db.allDocs<AnyDocument>({ include_docs: true });
  return result.rows.flatMap((row) => (row.doc?.type === type ? [upMigrate<T>(row.doc)] : []));
};

/** Fires whenever local data changes, including changes pulled in by sync. */
export const onChange = (listener: () => void): (() => void) => {
  const feed = db.changes({ since: 'now', live: true }).on('change', listener);
  return () => feed.cancel();
};
