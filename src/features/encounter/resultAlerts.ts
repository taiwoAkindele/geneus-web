import { effectiveEncounterEntries, ENCOUNTER_STEP_VALUES, type EncounterEntry, type EncounterStep } from '@shared';

export const RESULT_ALERT_STEPS: readonly EncounterStep[] = ['lab_order', 'lab_results', 'result_review', 'amendment'];

/** One result entry back from the laboratory that its ordering clinician has not yet reviewed. */
export type ResultAlert = { id: string; encounterId: string; patientId: string; tests: string[]; resultedOn: string };

/**
 * Results to alert a clinician about: entered against an order they signed and not
 * yet acknowledged in a result review. An alert ends by itself once reviewed.
 */
export const resultAlerts = (entries: readonly EncounterEntry[], staffId: string): ResultAlert[] => {
  const effective = effectiveEncounterEntries(entries);
  const orderedBy = new Map(effective.filter((e) => e.step === 'lab_order').map((e) => [e.encounterId, e.createdBy]));
  const reviewed = new Set(effective.filter((e) => e.step === 'result_review').flatMap((e) => e.values.resultEntryIds as string[]));
  return effective
    .filter((e) => e.step === 'lab_results' && orderedBy.get(e.encounterId) === staffId && !reviewed.has(e.id))
    .map((e) => ({ id: e.id, encounterId: e.encounterId, patientId: e.patientId, tests: ENCOUNTER_STEP_VALUES.lab_results.parse(e.values).results.map((r) => r.test), resultedOn: e.createdOn }))
    .sort((a, b) => b.resultedOn.localeCompare(a.resultedOn));
};
