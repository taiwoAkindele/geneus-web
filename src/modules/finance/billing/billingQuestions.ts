import type { SyncRejection } from '@shared';
import { useLiveQuery } from '@/data';
import { allOfType } from '@/data/db';
import { useRequestQueues } from '@/modules/clinical/encounter/useEncounterLists';
import type { BillDocument } from './billDocuments';

/**
 * A billing question is an existing review case (a clinical request whose charge
 * needs a financial decision, or a refused charge link). They are shown on the
 * bill they affect; the review records and their resolution are unchanged.
 */
export type BillingQuestion = {
  key: string;
  patientId: string;
  encounterId?: string;
  name: string;
};
const readRefusals = () => allOfType<SyncRejection>('sync_rejection');

export const useBillingQuestions = () => {
  const queues = useRequestQueues();
  const refusals = useLiveQuery(readRefusals, ['sync_rejection']);
  const questions: BillingQuestion[] = [
    ...Object.values(queues.data ?? {})
      .flatMap((queue) => [...queue.open, ...queue.completed])
      .filter((r) => r.billingPending)
      .flatMap((r) =>
        r.billingReviews?.length
          ? r.billingReviews.map((item) => ({
              key: `${r.id}:${item.id}`,
              patientId: r.patientId,
              encounterId: r.encounterId,
              name: item.name,
            }))
          : [
              {
                key: r.id,
                patientId: r.patientId,
                encounterId: r.encounterId,
                name: 'Medicine supply',
              },
            ],
      ),
    ...(refusals.data ?? [])
      .filter(
        (r) =>
          r.entityType === 'service_charge_allocation' &&
          !r.resolvedOn &&
          typeof r.refusedRecord?.patientId === 'string',
      )
      .map((r) => ({
        key: r.id,
        patientId: String(r.refusedRecord?.patientId),
        name: 'A charge link was refused',
      })),
  ];
  return { questions, loading: queues.loading && !queues.data, reload: queues.reload };
};

/** A charge raised by hand (New bill or Add items) rather than by a clinical order or supply. */
const manualCharge = (row: BillDocument['rows'][number]) =>
  !row.charge.orderItemId && !row.charge.dispenseEntryId;

/**
 * Places each question on the bill it most likely concerns, for display only:
 * the patient's bill with a hand-raised charge in the same visit, then the visit's own bill.
 * Questions with no such bill are returned separately so they stay reachable.
 */
export const placeQuestions = (
  bills: readonly BillDocument[],
  questions: readonly BillingQuestion[],
) => {
  const byBill = new Map<string, BillingQuestion[]>();
  const unplaced: BillingQuestion[] = [];
  for (const q of questions) {
    const own = bills.filter((b) => b.patientId === q.patientId);
    const sameVisit = (b: BillDocument) =>
      !q.encounterId ||
      b.rows.some((r) => !r.charge.encounterId || r.charge.encounterId === q.encounterId);
    const targets = own.filter((b) => b.rows.some(manualCharge) && sameVisit(b));
    const fallback = own.filter(
      (b) => q.encounterId && b.rows.some((r) => r.charge.encounterId === q.encounterId),
    );
    const chosen = targets.length ? targets : fallback;
    if (!chosen.length) {
      unplaced.push(q);
      continue;
    }
    for (const b of chosen) {
      byBill.set(b.id, [...(byBill.get(b.id) ?? []), q]);
    }
  }
  return { byBill, unplaced };
};
