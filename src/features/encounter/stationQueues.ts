import { CLOSING_STEPS, effectiveEncounterEntries, ENCOUNTER_STEP_VALUES, type EncounterEntry, type EncounterStep } from '@shared';

/**
 * The station queues (PRD §9.8.1): who is waiting for the laboratory, whose
 * results are back for the doctor, and whose prescription is waiting at the
 * pharmacy. Nothing is written to put a patient in a queue — each one is a
 * question asked of the steps already saved, so it can never disagree with
 * the encounter itself.
 */
export type StationQueue = 'lab' | 'results' | 'pharmacy';

export const STATION_QUEUES: readonly StationQueue[] = ['lab', 'results', 'pharmacy'];

/** The steps the queues are decided from — read by step, through the index. */
export const QUEUE_STEPS: readonly EncounterStep[] = ['lab_order', 'lab_results', 'result_review', 'diagnosis', 'prescription', 'dispense', 'amendment', ...CLOSING_STEPS];

export type QueuedPatient = {
  encounterId: string;
  patientId: string;
  /** When the step that put them in this queue was saved. */
  waitingSince: string;
  /** What the station needs to know: the tests ordered, or the drugs prescribed. */
  detail: string;
};

const firstAt = (entries: readonly EncounterEntry[], step: EncounterStep) =>
  entries
    .filter((entry) => entry.step === step)
    .sort((a, b) => b.createdOn.localeCompare(a.createdOn))[0];

/** Each open encounter in the queue it is waiting in, oldest first — the order patients arrived. */
export const stationQueues = (entries: readonly EncounterEntry[]): Record<StationQueue, QueuedPatient[]> => {
  const byEncounter = new Map<string, EncounterEntry[]>();
  for (const entry of effectiveEncounterEntries(entries)) byEncounter.set(entry.encounterId, [...(byEncounter.get(entry.encounterId) ?? []), entry]);

  const queues: Record<StationQueue, QueuedPatient[]> = { lab: [], results: [], pharmacy: [] };
  for (const [encounterId, saved] of byEncounter) {

    const order = firstAt(saved, 'lab_order');
    const results = firstAt(saved, 'lab_results');
    const diagnosis = firstAt(saved, 'diagnosis');
    const patientId = saved[0].patientId;

    if (order) {
      const { tests, items } = ENCOUNTER_STEP_VALUES.lab_order.parse(order.values);
      const completed = saved.filter((e) => e.step === 'lab_results').flatMap((e) => ENCOUNTER_STEP_VALUES.lab_results.parse(e.values).results.map((r) => r.orderItemId ?? r.test));
      const pending = tests.filter((t, index) => !completed.includes(items?.[index]?.id ?? t));
      if (pending.length) queues.lab.push({ encounterId, patientId, waitingSince: order.createdOn, detail: pending.join(', ') });
    }
    const reviewedIds = new Set(saved.filter((e) => e.step === 'result_review').flatMap((e) => e.values.resultEntryIds as string[]));
    if (results && saved.some((e) => e.step === 'lab_results' && !reviewedIds.has(e.id))) {
      queues.results.push({ encounterId, patientId, waitingSince: results.createdOn, detail: 'Lab results are back' });
    }
    const medication = firstAt(saved, 'prescription');
    if ((medication || diagnosis) && !firstAt(saved, 'dispense')) {
      const { prescription } = medication ? ENCOUNTER_STEP_VALUES.prescription.parse(medication.values) : ENCOUNTER_STEP_VALUES.diagnosis.parse(diagnosis!.values);
      if (prescription.length > 0) {
        queues.pharmacy.push({
          encounterId,
          patientId,
          waitingSince: (medication ?? diagnosis)!.createdOn,
          detail: prescription.map((line) => line.drug).join(', '),
        });
      }
    }
  }
  for (const queue of STATION_QUEUES) queues[queue].sort((a, b) => a.waitingSince.localeCompare(b.waitingSince));
  return queues;
};
