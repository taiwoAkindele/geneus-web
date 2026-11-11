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

/** A visit recorded in order up to its treatment decisions, with no tests ordered. */
const treatedVisit = () => [
  entry('vitals', { temperatureC: 37 }), entry('complaint', { complaints: ['Headache'] }), entry('investigation_review', { decision: 'none_required' }),
  entry('diagnosis', { diagnosis: 'Recorded assessment', prescription: [] }), entry('prescription', { decision: 'none_required', prescription: [] }), entry('injection_order', { required: false }),
];

describe('one visit order, enforced on the device and the server', () => {
  it('lists the testing decision, order and results before the diagnosis', () => {
    const data = { ...structuredClone(EMPTY_ENCOUNTER_DATA), lab_order: { tests: ['Full blood count'] } };
    expect(stepsFor(data).map((s) => s.key)).toEqual(['vitals', 'complaint', 'investigation_review', 'lab_order', 'lab_results', 'result_review', 'diagnosis', 'prescription', 'injection_order', 'disposition']);
    expect(stepsFor(structuredClone(EMPTY_ENCOUNTER_DATA)).map((s) => s.key)).toEqual(['vitals', 'complaint', 'investigation_review', 'diagnosis', 'prescription', 'injection_order', 'disposition']);
  });
  it('requires vitals before the complaint, and the complaint before deciding on tests', () => {
    const vitals = entry('vitals', { pulseBpm: 80 }), complaint = entry('complaint', { complaints: ['Fever'] });
    expect(careEntryIssues(complaint, [])).toEqual(['Record at least one vital sign before the complaint']);
    expect(careEntryIssues(complaint, [vitals])).toEqual([]);
    expect(careEntryIssues(entry('investigation_review', { decision: 'none_required' }), [vitals])).toEqual(['Record the complaint and clinical note before deciding on tests']);
    expect(careEntryIssues(entry('lab_order', { tests: ['Malaria RDT'] }), [vitals])).not.toEqual([]);
  });
  it('requires the testing decision, and every ordered result reviewed, before the diagnosis unless a reason is recorded', () => {
    const start = [entry('vitals', { pulseBpm: 80 }), entry('complaint', { complaints: ['Fever'] })];
    expect(careEntryIssues(entry('diagnosis', { diagnosis: 'Malaria' }), start)).toEqual(['Record the testing decision before the diagnosis']);
    const order = entry('lab_order', { tests: ['Malaria RDT', 'Full blood count'] });
    const ordered = [...start, order, entry('investigation_review', { decision: 'ordered', orderEntryId: order.id })];
    expect(careEntryIssues(entry('diagnosis', { diagnosis: 'Malaria' }), ordered)).toEqual(['Review every ordered test result before the diagnosis, or record why you are continuing without them']);
    expect(careEntryIssues(entry('diagnosis', { diagnosis: 'Malaria', pendingResultsReason: 'Treating on clinical grounds while the count is processed' }), ordered)).toEqual([]);
    const results = entry('lab_results', { results: [{ test: 'Malaria RDT', result: 'Positive' }, { test: 'Full blood count', result: 'Normal' }] });
    expect(careEntryIssues(entry('diagnosis', { diagnosis: 'Malaria' }), [...ordered, results])).not.toEqual([]);
    const reviewed = [...ordered, results, entry('result_review', { resultEntryIds: [results.id] })];
    expect(careEntryIssues(entry('diagnosis', { diagnosis: 'Malaria' }), reviewed)).toEqual([]);
  });
  it('requires the diagnosis before treatment, and every treatment decision before disposition', () => {
    const visit = treatedVisit();
    expect(careEntryIssues(entry('prescription', { decision: 'none_required', prescription: [] }), visit.slice(0, 3))).toEqual(['Record the diagnosis before treatment decisions']);
    expect(careEntryIssues(entry('injection_order', { required: false }), visit.slice(0, 3))).toEqual(['Record the diagnosis before treatment decisions']);
    expect(careEntryIssues(entry('disposition', { kind: 'home_care', note: 'Advice' }), visit.slice(0, 5))).toEqual(['Record the medication and injection decisions before disposition']);
  });
  it('refuses the retired follow-up and admission steps whatever the workflow version', () => {
    for (const step of ['follow_up', 'admission'] as const) expect(careEntryIssues({ step, values: {} }, treatedVisit())).toEqual(['Record an explicit disposition for this consultation']);
    expect(careEntryIssues({ step: 'diagnosis', values: { diagnosis: 'Assessment', prescription: [{ drug: 'Paracetamol', dose: '1 g' }] } }, treatedVisit())).not.toEqual([]);
  });
});

describe('independent clinical decisions', () => {
  it('completes a consultation with no medication, investigations or admission', () => {
    const before = treatedVisit();
    const disposition = entry('disposition', { kind: 'home_care', note: 'Advice and review instructions recorded' });
    expect(careEntryIssues(disposition, before)).toEqual([]);
    const state = project([...before, disposition]);
    expect(state.closed).toBe(true);
    expect(state.admitted).toBe(false);
    expect(state.data.lab_order.tests).toEqual([]);
    expect(state.data.prescription.rx).toEqual([]);
    expect(stationQueues([...before, disposition])).toEqual({ lab: [], results: [], pharmacy: [] });
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
    const prior = treatedVisit();
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
