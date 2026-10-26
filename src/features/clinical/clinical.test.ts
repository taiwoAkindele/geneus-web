import { describe, expect, it } from 'vitest';
import { ClinicalEvent, type EncounterEntry } from '@shared';
import { activeAllergies, observationHistory } from './clinicalSummary';
import { clinicalFormDefaults, clinicalFormValues } from './clinicalForms';

const allergy = ClinicalEvent.parse({
  type: 'clinical_event', id: 'allergy:one', recordId: 'allergy:one', facilityId: 'OOE-PHC', patientId: 'OOE-PHC-000047-K2',
  createdBy: 'staff:doctor', createdOn: '2026-10-25T09:00:00Z', deviceId: 'device:one', actorRole: 'doctor', kind: 'allergy',
  values: { allergen: 'Penicillin', reaction: 'Rash', severity: 'moderate', verification: 'reported', status: 'active' },
});
describe('clinical record presentation', () => {
  it('removes a refuted allergy from alerts while keeping the history', () => {
    const refuted = { ...allergy, id: 'allergy:review', previousId: allergy.id, values: { ...allergy.values, verification: 'refuted' } };
    expect(activeAllergies([allergy])).toHaveLength(1);
    expect(activeAllergies([allergy, refuted])).toEqual([]);
  });
  it('keeps a new assessment blank and only saves measurements for the selected specialty', () => {
    expect(clinicalFormDefaults('specialty').assessment).toBe('');
    const values = clinicalFormValues('specialty', { specialty: 'hypertension', assessment: 'Review', plan: 'Follow-up', status: 'active', 'measurement_Adherence': 'Discussed', 'measurement_HbA1c (%)': '7' });
    expect(values.measurements).toEqual({ Adherence: 'Discussed' });
  });
  it('preserves separate medication fields through editing', () => {
    const form = clinicalFormDefaults('medication', undefined, { drug: 'Medicine', dose: '1 tablet', frequency: 'daily', duration: '7 days', route: 'oral', status: 'active' });
    expect(clinicalFormValues('medication', form)).toMatchObject({ dose: '1 tablet', frequency: 'daily', duration: '7 days', route: 'oral' });
  });
  it('prefills a reconciled prescription over an existing medication while retaining its problem link', () => {
    const medication = { ...allergy, kind: 'medication' as const, values: { drug: 'Medicine', dose: '1 tablet', frequency: 'daily', status: 'active', problemId: 'problem:one' } };
    const form = clinicalFormDefaults('medication', medication, { dose: '2 tablets' });
    expect(clinicalFormValues('medication', form)).toMatchObject({ dose: '2 tablets', frequency: 'daily', problemId: 'problem:one' });
  });
  it('shows every observation, with corrected readings and derived BMI', () => {
    const original: EncounterEntry = { ...allergy, id: 'vitals:1', type: 'encounter_entry', encounterId: 'encounter:one', step: 'vitals', values: { weightKg: 80, heightCm: 200 } };
    const repeat: EncounterEntry = { ...original, id: 'vitals:2', createdOn: '2026-10-25T10:00:00Z', values: { weightKg: 82 } };
    const correction: EncounterEntry = { ...original, id: 'amend:1', step: 'amendment', amends: original.id, values: { note: 'Correct weight', correctedValues: { weightKg: 84, heightCm: 200 } } };
    const rows = observationHistory([original, repeat, correction]);
    expect(rows).toHaveLength(2);
    expect(rows[0].id).toBe(repeat.id);
    expect(rows[1].bmi).toBe('21.0');
    expect(original.values.weightKg).toBe(80);
  });
});
