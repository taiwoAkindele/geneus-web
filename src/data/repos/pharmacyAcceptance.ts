import { dispensingDetails, type EncounterEntry, type SyncRejection } from '@shared';
import { allOfType } from '../db';
import { listWorkforceReceipts } from './workforceReceipts';
/** Records refused by the server and not later accepted: the only starting points for blocking. */
const refusedIds = async (): Promise<Set<string>> => {
  const [rejections, receipts] = await Promise.all([allOfType<SyncRejection>('sync_rejection'), listWorkforceReceipts()]);
  const accepted = new Set(receipts.filter((r) => r.outcome === 'applied').map((r) => r.id));
  return new Set([...rejections.filter((r) => !accepted.has(r.entityId)).map((r) => r.entityId), ...receipts.filter((r) => r.outcome === 'rejected' && !accepted.has(r.id)).map((r) => r.id)]);
};
const blockedPharmacyEntries = async (entries: readonly EncounterEntry[], refused?: Set<string>) => {
  const blocked = new Set(refused ?? await refusedIds());
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of entries) {
      const d = dispensingDetails(entry);
      if (!blocked.has(entry.id) && (blocked.has(entry.encounterId) || Boolean(entry.amends && blocked.has(entry.amends)) || (d && (blocked.has(d.prescriptionEntryId) || Boolean(d.previousEntryId && blocked.has(d.previousEntryId)))))) { blocked.add(entry.id); changed = true; }
    }
  }
  return blocked;
};
/** A refused full supply must not hide an outstanding prescription from Pharmacy. */
export const usablePharmacyEntries = async (entries: EncounterEntry[]) => {
  const blocked = await blockedPharmacyEntries(entries);
  return entries.filter((entry) => !blocked.has(entry.id));
};
/** Refused supplies cannot establish a stock balance or patient bill while awaiting the next checkpoint. */
export const usablePharmacyEffects = async <T extends { dispenseEntryId?: string }>(records: T[]): Promise<T[]> => {
  if (!records.some((r) => r.dispenseEntryId)) return records;
  // With nothing refused nothing can be blocked, so the clinical entries need not be read.
  const refused = await refusedIds();
  if (!refused.size) return records;
  const blocked = await blockedPharmacyEntries(await allOfType<EncounterEntry>('encounter_entry'), refused);
  return records.filter((r) => !r.dispenseEntryId || !blocked.has(r.dispenseEntryId));
};
