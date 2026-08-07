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
export const allOfType = async <T extends AnyDocument>(type: DocType): Promise<T[]> => {
  const result = await db.allDocs<AnyDocument>({ include_docs: true });
  return result.rows.flatMap((row) => (row.doc?.type === type ? [row.doc as T] : []));
};

/** Fires whenever local data changes, including changes pulled in by sync. */
export const onChange = (listener: () => void): (() => void) => {
  const feed = db.changes({ since: 'now', live: true }).on('change', listener);
  return () => feed.cancel();
};
