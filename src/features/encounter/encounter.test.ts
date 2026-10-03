import { describe, expect, it } from 'vitest';
import type { Encounter, EncounterEntry } from '@shared';
import { EMPTY_ENCOUNTER_DATA, projectEncounter } from './encounterRecord';
import { summariseEncounter } from './encounterSummary';
import { fromStepValues, stepProblems, toStepValues } from './stepValues';
import type { EncounterData, StepKey } from './types';

const encounter: Encounter = {
  id: 'encounter:abc123',
  type: 'encounter',
  facilityId: 'OOE-PHC',
  schemaVersion: 3,
  createdBy: 'staff:nurse',
  createdOn: '2026-10-02T09:00:00Z',
  deviceId: 'device-1',
  patientId: 'OOE-PHC-000047-K2',
  openedOn: '2026-10-02T09:00:00Z',
  setting: 'facility',
};

let minute = 0;
const entry = (step: EncounterEntry['step'], values: Record<string, unknown>, extra: Partial<EncounterEntry> = {}): EncounterEntry => {
  minute += 1;
  return {
    id: `encounter_entry:${step}-${minute}`,
    type: 'encounter_entry',
    facilityId: 'OOE-PHC',
    schemaVersion: 3,
    createdBy: 'staff:nurse',
    createdOn: `2026-10-02T09:${String(minute).padStart(2, '0')}:00Z`,
    deviceId: 'device-1',
    encounterId: encounter.id,
    patientId: encounter.patientId,
    step,
    actorRole: 'nurse',
    values,
    ...extra,
  };
};

const project = (entries: EncounterEntry[], draft: EncounterData = EMPTY_ENCOUNTER_DATA, skippedNow: StepKey[] = []) =>
  projectEncounter({
    patientId: encounter.patientId,
    encounter,
    entries,
    draft,
    skippedNow,
    staffNames: new Map([['staff:nurse', 'Ngozi Bello']]),
  });

describe('section values', () => {
  it('reads blood pressure as two numbers and leaves blank vitals out', () => {
    const data = { ...EMPTY_ENCOUNTER_DATA, vitals: { temp: '38.9', bp: '118 / 76', pulse: '', weight: '', spo2: '' } };

    expect(toStepValues('vitals', data)).toEqual({
      temperatureC: 38.9,
      systolicMmHg: 118,
      diastolicMmHg: 76,
      pulseBpm: undefined,
      weightKg: undefined,
      spo2Percent: undefined,
    });
  });

  it('explains what to fix in words, not in field names', () => {
    const unreadable = { ...EMPTY_ENCOUNTER_DATA, vitals: { ...EMPTY_ENCOUNTER_DATA.vitals, bp: '118' } };

    expect(stepProblems('vitals', EMPTY_ENCOUNTER_DATA)).toEqual(['Record at least one vital sign']);
    expect(stepProblems('vitals', unreadable)).toEqual(['Check blood pressure (e.g. 120/80)']);
    expect(stepProblems('lab_order', EMPTY_ENCOUNTER_DATA)[0]).toMatch(/skip this step/);
  });

  it('asks why a prescribed drug was not handed over', () => {
    const data = {
      ...EMPTY_ENCOUNTER_DATA,
      diagnosis: { ...EMPTY_ENCOUNTER_DATA.diagnosis, rx: [{ name: 'Paracetamol', dose: '500mg' }] },
    };

    expect(stepProblems('dispense', data)).toEqual(['Give a reason for anything not dispensed']);
    expect(stepProblems('dispense', { ...data, dispense: { done: {}, reasons: { 0: 'Out of stock' } } })).toEqual([]);
  });

  it('saves complaints as typed, in the patient’s words, and reads older lists back joined', () => {
    const typed = { ...EMPTY_ENCOUNTER_DATA, complaint: { text: '  pain when passing urine for 2 days ', note: '' } };

    expect(toStepValues('complaint', typed)).toEqual({ complaints: ['pain when passing urine for 2 days'], note: undefined });
    expect(stepProblems('complaint', EMPTY_ENCOUNTER_DATA)).toEqual(['Record a complaint or a clinical note']);
    expect(fromStepValues('complaint', { complaints: ['Fever', 'Headache'] }, EMPTY_ENCOUNTER_DATA).complaint.text).toBe('Fever, Headache');
  });

  it('reads a saved section back exactly as it was entered', () => {
    const data = { ...EMPTY_ENCOUNTER_DATA, vitals: { temp: '37.5', bp: '120/80', pulse: '72', weight: '60', spo2: '98' } };

    expect(fromStepValues('vitals', toStepValues('vitals', data), EMPTY_ENCOUNTER_DATA).vitals).toEqual(data.vitals);
  });
});

describe('the encounter on screen', () => {
  it('starts at vitals with nothing filled in', () => {
    const state = projectEncounter({
      patientId: 'p',
      encounter: undefined,
      entries: [],
      draft: EMPTY_ENCOUNTER_DATA,
      skippedNow: [],
      staffNames: new Map(),
    });

    expect(state.activeIndex).toBe(0);
    expect(state.id).toBeUndefined();
    expect(state.data.vitals.temp).toBe('');
  });

  it('shows saved sections from their entries, signed by name and role, and moves on', () => {
    const state = project([entry('vitals', { temperatureC: 38.9 })]);

    expect(state.data.vitals.temp).toBe('38.9');
    expect(state.sig.vitals).toMatchObject({ actor: 'Ngozi Bello', role: 'Nurse' });
    expect(state.activeIndex).toBe(1);
  });

  it('marks sections passed over before a later save as skipped, without writing them', () => {
    const state = project([entry('vitals', { temperatureC: 37 }), entry('diagnosis', { diagnosis: 'Malaria' })]);

    expect(state.skipped).toEqual(['complaint', 'lab_order', 'lab_results']);
    expect(state.entries.lab_order).toBeUndefined();
  });

  it('moves past a section skipped now', () => {
    const state = project([entry('vitals', { temperatureC: 37 })], EMPTY_ENCOUNTER_DATA, ['complaint']);

    expect(state.activeIndex).toBe(2);
    expect(state.skipped).toEqual(['complaint']);
  });

  it('grows the tail from the saved plan and closes on the closing step', () => {
    const plan = entry('diagnosis', { diagnosis: 'Malaria', prescription: [{ drug: 'ACT', dose: '1 tab' }], admit: true });
    const admitted = project([
      plan,
      entry('dispense', { lines: [{ drug: 'ACT', dispensed: true }] }),
      entry('admission', { ward: 'General ward' }),
    ]);

    expect(admitted.closed).toBe(true);
    expect(admitted.admitted).toBe(true);
    expect(admitted.activeIndex).toBe(-1);
  });

  it('shows an amendment beside the section it corrects, and logs it', () => {
    const vitals = entry('vitals', { temperatureC: 38.9 });
    const state = project([vitals, entry('amendment', { note: 'Was 37.9' }, { amends: vitals.id })]);

    expect(state.amend.vitals?.[0]?.note).toBe('Was 37.9');
    expect(state.data.vitals.temp).toBe('38.9');
    expect(state.audit.map((row) => row.action)).toEqual([
      'Encounter opened',
      'Vitals recorded and locked',
      'Amendment added to Vitals',
    ]);
  });
});

describe('encounter list cards', () => {
  it('headlines the diagnosis and the key findings', () => {
    const card = summariseEncounter(encounter, [
      entry('vitals', { temperatureC: 38.9, systolicMmHg: 118, diastolicMmHg: 76 }),
      entry('lab_order', { tests: ['Malaria RDT', 'FBC'] }),
      entry('diagnosis', { diagnosis: 'Malaria' }),
    ]);

    expect(card).toMatchObject({ status: 'Open', title: 'Malaria', chips: ['38.9°C', '118/76', '2 tests'], label: 'ENC-ABC123' });
  });

  it('is closed once a follow-up is saved, with or without a review booked', () => {
    expect(summariseEncounter(encounter, [entry('follow_up', {})]).status).toBe('Closed');
  });
});
