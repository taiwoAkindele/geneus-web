import type { CrudEntry, PowerSyncBackendConnector, PowerSyncCredentials } from '@powersync/web';
import type { UploadMutation, UploadRequest } from '@shared';
import { fetchSyncToken, uploadMutations } from '@/lib/api/sync';
import { isUnauthorized } from '@/lib/api/client';
import type { LocalDatabase } from './database';
import { getDeviceCredential, recordServerContact } from './deviceCredential';
import { decodeValues } from './rows';
import { TYPE_FOR } from './tables';

/**
 * How PowerSync talks to geneus-server on this device's behalf: a short-lived
 * sync token minted from the device credential, and the queued local writes
 * handed to `/sync/upload`. PowerSync owns the queue, the retries and the
 * reconnects; this file owns only the shape of the two exchanges.
 *
 * Rejections come back inside a 200 and as `sync_rejection` records that sync
 * down to the reconcile queue — the transaction is still completed, because
 * retrying it would only reproduce the rejection and stall every write behind
 * it. Only a network or server failure leaves the transaction in place, and
 * PowerSync retries it.
 */
export type ConnectorOptions = {
  /** Called when the server no longer recognises this device's credential. */
  onDeenrolled: () => Promise<void>;
};

/** One queued write as the contract describes it (SCHEMA.md §12). */
export const toMutation = (entry: CrudEntry): UploadMutation => {
  const table = TYPE_FOR[entry.table];
  if (!table) throw new Error(`queued write for unknown table ${entry.table}`);
  const data = decodeValues(table, entry.opData ?? {});
  // PowerSync omits unchanged columns from a PATCH, so a second edit by the same
  // person arrives without `updatedBy`; db.ts put the actor in the write's
  // metadata for exactly this case, and the server insists on knowing who.
  if (entry.op === 'PATCH' && data.updatedBy === undefined && entry.metadata) data.updatedBy = entry.metadata;
  return {
    clientId: entry.clientId,
    op: entry.op.toLowerCase() as UploadMutation['op'],
    table,
    id: entry.id,
    data,
    ...(entry.previousValues ? { previous: decodeValues(table, entry.previousValues) } : {}),
  };
};

export const createConnector = ({ onDeenrolled }: ConnectorOptions): PowerSyncBackendConnector => ({
  fetchCredentials: async (): Promise<PowerSyncCredentials | null> => {
    const device = getDeviceCredential();
    if (!device) return null;
    try {
      const minted = await fetchSyncToken(device.credential);
      recordServerContact(minted.serverTime);
      return { endpoint: minted.syncEndpoint, token: minted.token, expiresAt: new Date(minted.expiresOn) };
    } catch (cause) {
      if (isUnauthorized(cause)) {
        await onDeenrolled();
        return null;
      }
      throw cause;
    }
  },

  uploadData: async (database): Promise<void> => {
    const device = getDeviceCredential();
    if (!device) return;
    const db = database as unknown as Pick<LocalDatabase, 'getNextCrudTransaction'>;

    for (;;) {
      const transaction = await db.getNextCrudTransaction();
      if (!transaction) return;

      const request: UploadRequest = {
        transactionId: transaction.transactionId ?? null,
        mutations: transaction.crud.map(toMutation),
      };
      try {
        const response = await uploadMutations(device.credential, request);
        recordServerContact(response.serverTime);
        if (response.rejected.length > 0) {
          console.warn('server rejected queued writes — see the reconcile queue', response.rejected);
        }
      } catch (cause) {
        if (isUnauthorized(cause)) await onDeenrolled();
        throw cause;
      }
      await transaction.complete();
    }
  },
});
