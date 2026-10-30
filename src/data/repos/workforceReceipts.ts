import type { UploadMutation } from '@shared';
import { postAsDevice } from '@/lib/api/client';
import { getDatabase } from '../database';
import { WORKFORCE_RECEIPTS_TABLE } from '../tables';
export type WorkforceReceipt = {
  id: string;
  clientId: number;
  outcome: 'applied' | 'rejected';
};
export const listWorkforceReceipts = () => getDatabase().getAll<WorkforceReceipt>(`SELECT * FROM ${WORKFORCE_RECEIPTS_TABLE}`);
/** Only a server receipt establishes acceptance; duplicate acknowledgements alone do not. */
export const confirmWorkforceReceipts = async (credential: string, mutations: readonly UploadMutation[]): Promise<void> => {
  if (!mutations.length)
    return;
  for (let offset = 0; offset < mutations.length; offset += 1000) {
    const batch = mutations.slice(offset, offset + 1000);
    const receipts = await postAsDevice<{
      applied: number[];
      rejected: number[];
    }>('/sync/receipts', credential, { clientIds: batch.map((m) => m.clientId) });
    for (const mutation of batch) {
      const outcome = receipts.rejected.includes(mutation.clientId) ? 'rejected' : receipts.applied.includes(mutation.clientId) ? 'applied' : undefined;
      if (!outcome)
        throw new Error('Waiting for the server to confirm this upload. Its queue entry is retained');
      // PowerSync exposes this local table as a view, which cannot use UPSERT.
      // Keep the read and write atomic so an older receipt cannot replace a newer one.
      await getDatabase().writeTransaction(async (tx) => {
        const previous = await tx.getOptional<WorkforceReceipt>(`SELECT * FROM ${WORKFORCE_RECEIPTS_TABLE} WHERE id = ?`, [mutation.id]);
        if (previous && previous.clientId > mutation.clientId) return;
        if (previous) {
          await tx.execute(`UPDATE ${WORKFORCE_RECEIPTS_TABLE} SET clientId = ?, outcome = ? WHERE id = ?`, [mutation.clientId, outcome, mutation.id]);
        } else {
          await tx.execute(`INSERT INTO ${WORKFORCE_RECEIPTS_TABLE}(id,clientId,outcome) VALUES(?,?,?)`, [mutation.id, mutation.clientId, outcome]);
        }
      });
    }
  }
};
