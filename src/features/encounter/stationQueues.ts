import { CLOSING_STEPS, ENCOUNTER_STEP_VALUES, type EncounterEntry, type EncounterStep } from '@shared';

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
export const QUEUE_STEPS: readonly EncounterStep[] = ['lab_order', 'lab_results', 'diagnosis', 'dispense', ...CLOSING_STEPS];

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
    .sort((a, b) => a.createdOn.localeCompare(b.createdOn))[0];

/** Each open encounter in the queue it is waiting in, oldest first — the order patients arrived. */
export const stationQueues = (entries: readonly EncounterEntry[]): Record<StationQueue, QueuedPatient[]> => {
  const byEncounter = new Map<string, EncounterEntry[]>();
  for (const entry of entries) byEncounter.set(entry.encounterId, [...(byEncounter.get(entry.encounterId) ?? []), entry]);

  const queues: Record<StationQueue, QueuedPatient[]> = { lab: [], results: [], pharmacy: [] };
  for (const [encounterId, saved] of byEncounter) {
    if (saved.some((entry) => (CLOSING_STEPS as readonly string[]).includes(entry.step))) continue;
    const order = firstAt(saved, 'lab_order');
    const results = firstAt(saved, 'lab_results');
    const diagnosis = firstAt(saved, 'diagnosis');
    const patientId = saved[0].patientId;

    if (order && !results && !diagnosis) {
      const { tests } = ENCOUNTER_STEP_VALUES.lab_order.parse(order.values);
      queues.lab.push({ encounterId, patientId, waitingSince: order.createdOn, detail: tests.join(', ') });
    }
    if (results && !diagnosis) {
      queues.results.push({ encounterId, patientId, waitingSince: results.createdOn, detail: 'Lab results are back' });
    }
    if (diagnosis && !firstAt(saved, 'dispense')) {
      const { prescription } = ENCOUNTER_STEP_VALUES.diagnosis.parse(diagnosis.values);
      if (prescription.length > 0) {
        queues.pharmacy.push({
          encounterId,
          patientId,
          waitingSince: diagnosis.createdOn,
          detail: prescription.map((line) => line.drug).join(', '),
        });
      }
    }
  }
  for (const queue of STATION_QUEUES) queues[queue].sort((a, b) => a.waitingSince.localeCompare(b.waitingSince));
  return queues;
};
