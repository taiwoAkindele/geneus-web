import { currentAllergies, effectiveEncounterEntries, ENCOUNTER_STEP_VALUES, type ClinicalEvent, type EncounterEntry } from '@shared';

export const activeAllergies = (events: readonly ClinicalEvent[]) => currentAllergies(events);
export const observationHistory = (entries: readonly EncounterEntry[]) => effectiveEncounterEntries(entries).filter((entry) => entry.step === 'vitals').map((entry) => {
  const values = ENCOUNTER_STEP_VALUES.vitals.parse(entry.values);
  const bmi = values.heightCm && values.weightKg ? (values.weightKg / (values.heightCm / 100) ** 2).toFixed(1) : undefined;
  return { ...values, id: entry.id, recordedOn: entry.createdOn, patientId: entry.patientId, bmi };
}).sort((a, b) => b.recordedOn.localeCompare(a.recordedOn));
