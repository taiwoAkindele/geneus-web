import { describe, expect, it } from 'vitest';
import { careEntryIssues, closesEncounter, ENCOUNTER_STEP_VALUES, type Encounter, type EncounterEntry } from '@shared';
import { EMPTY_ENCOUNTER_DATA, projectEncounter } from './encounterRecord';
import { stationQueues } from './stationQueues';
import { fromStepValues, toStepValues } from './stepValues';
import { stepsFor } from './steps';

const encounter: Encounter = { id: 'encounter:independent', type: 'encounter', workflowVersion: 1, facilityId: 'A', deviceId: 'device:A', createdBy: 'staff:A', createdOn: '2026-10-30T09:00:00Z', schemaVersion: 4, patientId: 'A-000001-K2', openedOn: '2026-10-30T09:00:00Z', setting: 'facility' };
let sequence = 0;
const entry = (step: EncounterEntry['step'], values: Record<string, unknown>): EncounterEntry => ({ ...encounter, type: 'encounter_entry', id: `entry:${++sequence}`, encounterId: encounter.id, actorRole: 'doctor', step, values, createdOn: `2026-10-30T09:${String(sequence).padStart(2, '0')}:00Z` });
const project = (entries: EncounterEntry[]) => projectEncounter({ patientId: encounter.patientId, encounter, entries, draft: structuredClone(EMPTY_ENCOUNTER_DATA), skippedNow: [], staffNames: new Map() });

describe('independent clinical decisions', () => {
  it('completes a consultation with no medication, investigations or admission', () => {
    const diagnosis = entry('diagnosis', { diagnosis: 'Recorded assessment', prescription: [] });
    const review = entry('investigation_review', { decision: 'none_required' });
    const disposition = entry('disposition', { kind: 'home_care', note: 'Advice and review instructions recorded' });
    expect(careEntryIssues(disposition, [diagnosis, review])).toEqual([]);
    const state = project([diagnosis, review, disposition]);
    expect(state.closed).toBe(true);
    expect(state.admitted).toBe(false);
    expect(state.data.lab_order.tests).toEqual([]);
    expect(state.data.prescription.rx).toEqual([]);
    expect(stationQueues([diagnosis, review, disposition])).toEqual({ lab: [], results: [], pharmacy: [] });
  });
  it('keeps a new encounter in the independent workflow after diagnosis is signed first', () => {
    const state = project([entry('diagnosis', { diagnosis: 'Assessment', prescription: [] })]);
    expect(state.data.workflowVersion).toBe(1);
    expect(stepsFor(state.data).map((s) => s.key)).toContain('disposition');
    expect(stepsFor(state.data).map((s) => s.key)).not.toContain('follow_up');
  });
  it('does not treat missing investigation entries as none required or default discharge', () => {
    const state = project([entry('diagnosis', { diagnosis: 'Assessment' })]);
    expect(state.data.investigation_review.decision).toBe('');
    expect(state.data.disposition.kind).toBe('');
    expect(state.closed).toBe(false);
    expect(careEntryIssues(entry('disposition', { kind: 'home_care', note: 'Advice' }), [])).not.toEqual([]);
  });
  it('requires an observation owner and reassessment, and preserves observation until a successor', () => {
    expect(ENCOUNTER_STEP_VALUES.disposition.safeParse({ kind: 'observation', note: 'Observe' }).success).toBe(false);
    const prior = [entry('diagnosis', { diagnosis: 'Assessment' }), entry('investigation_review', { decision: 'none_required' })];
    const observation = entry('disposition', { kind: 'observation', note: 'Reassess', responsibleService: 'Observation unit', reassessOn: '2026-10-30T12:00:00Z' });
    expect(closesEncounter(observation)).toBe(false);
    expect(project([...prior, observation]).closed).toBe(false);
    const discharge = entry('disposition', { kind: 'home_care', note: 'Review completed', previousEntryId: observation.id });
    expect(careEntryIssues(discharge, [...prior, observation])).toEqual([]);
    expect(careEntryIssues({ ...discharge, values: { ...discharge.values, previousEntryId: 'stale' } }, [...prior, observation])).not.toEqual([]);
  });
  it('does not encode injection or admission inside a new diagnosis', () => {
    expect(careEntryIssues(entry('diagnosis', { diagnosis: 'Assessment', giveInjection: true }), [])).not.toEqual([]);
    const order = entry('injection_order', { required: true, drug: 'Synthetic medicine', dose: 'Recorded dose', route: 'IM' });
    expect(closesEncounter(order)).toBe(false);
    expect(ENCOUNTER_STEP_VALUES.injection_order.safeParse({ required: true }).success).toBe(false);
    expect(project([order]).data.diagnosis.injection).toBe(false);
  });
  it('keeps prescriptions separate from subsequent diagnosis corrections', () => {
    const rx = entry('prescription', { decision: 'prescribed', prescription: [{ drug: 'Synthetic medicine', dose: 'Recorded dose' }] });
    const diagnosis = entry('diagnosis', { diagnosis: 'Updated assessment', prescription: [] });
    const state = project([rx, diagnosis]);
    expect(state.data.prescription.rx[0].name).toBe('Synthetic medicine');
    expect(toStepValues('prescription', state.data).prescription).toHaveLength(1);
  });
  it('retains pending tests and dispensing after completion and tracks same-name tests by item identity', () => {
    const items = ['one', 'two'].map((id) => ({ id, name: 'Same test label', offeringId: `offering:${id}`, serviceDefinitionId: 'definition:test', priority: 'routine' }));
    const order = entry('lab_order', { tests: items.map((i) => i.name), items });
    const result = entry('lab_results', { results: [{ test: 'Same test label', orderItemId: 'one', result: 'Recorded finding' }] });
    const prescription = entry('prescription', { decision: 'prescribed', prescription: [{ drug: 'Synthetic medicine', dose: 'Recorded dose' }] });
    const close = entry('disposition', { kind: 'home_care', note: 'Results follow-up assigned' });
    const queues = stationQueues([order, result, prescription, close]);
    expect(queues.lab[0].detail).toBe('Same test label');
    expect(queues.pharmacy).toHaveLength(1);
    expect(careEntryIssues(result, [order, result])).not.toEqual([]);
    const second = entry('lab_results', { results: [{ test: 'Same test label', orderItemId: 'two', result: 'Second finding' }] });
    expect(careEntryIssues(second, [order, result, close])).toEqual([]);
    const state = project([order, result, close, second]);
    expect(state.data.lab_results).toEqual({ one: 'Recorded finding', two: 'Second finding' });
    expect(stationQueues([order, result, close, second]).lab).toEqual([]);
    const acknowledged = entry('result_review', { resultEntryIds: [result.id, second.id], note: 'Clinical review documented' });
    expect(careEntryIssues(acknowledged, [order, result, close, second])).toEqual([]);
    expect(stationQueues([order, result, close, second, acknowledged]).results).toEqual([]);
    const roundTrip = fromStepValues('lab_results', second.values, state.data);
    expect(roundTrip.lab_results.one).toBe('Recorded finding');
  });
});
