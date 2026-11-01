import { describe, expect, it } from 'vitest';
import type { EncounterEntry } from '@shared';
import { requestQueues } from './requestQueues';
import { resultAlerts } from './resultAlerts';

let minute = 0;
const entry = (encounterId: string, step: EncounterEntry['step'], values: Record<string, unknown>, createdBy = 'staff:doctor'): EncounterEntry => ({
  id: `entry:${++minute}`, type: 'encounter_entry', facilityId: 'TEST', deviceId: 'device:one', schemaVersion: 4, createdBy, createdOn: `2026-11-01T09:${String(minute).padStart(2, '0')}:00Z`,
  encounterId, patientId: `TEST-00000${encounterId.slice(-1)}-K2`, actorRole: 'doctor', step, values, workflowVersion: 1,
} as EncounterEntry);

describe('laboratory and pharmacy requests', () => {
  it('keeps a test request open until every test has a result, then completes it', () => {
    const order = entry('encounter:1', 'lab_order', { tests: ['Full blood count', 'Malaria RDT'] });
    const partial = entry('encounter:1', 'lab_results', { results: [{ test: 'Malaria RDT', result: 'Positive' }] }, 'staff:lab');
    let { lab } = requestQueues([order, partial]);
    expect(lab.open).toMatchObject([{ id: order.id, items: ['Full blood count', 'Malaria RDT'], pending: ['Full blood count'] }]);
    const rest = entry('encounter:1', 'lab_results', { results: [{ test: 'Full blood count', result: 'Normal' }] }, 'staff:lab');
    ({ lab } = requestQueues([order, partial, rest]));
    expect(lab.open).toEqual([]);
    expect(lab.completed).toMatchObject([{ id: order.id, pending: [], completedOn: rest.createdOn }]);
  });
  it('keeps a prescription open until dispensed, including one carried on a retired-order diagnosis', () => {
    const prescribed = entry('encounter:2', 'prescription', { decision: 'prescribed', prescription: [{ drug: 'Artemether-lumefantrine', dose: '4 tablets' }] });
    const legacy = entry('encounter:3', 'diagnosis', { diagnosis: 'Malaria', prescription: [{ drug: 'Paracetamol', dose: '1 g' }] });
    const none = entry('encounter:4', 'prescription', { decision: 'none_required', prescription: [] });
    let { pharmacy } = requestQueues([prescribed, legacy, none]);
    expect(pharmacy.open.map((r) => r.items)).toEqual([['Artemether-lumefantrine'], ['Paracetamol']]);
    const dispensed = entry('encounter:2', 'dispense', { lines: [{ drug: 'Artemether-lumefantrine', dispensed: true }] }, 'staff:pharmacy');
    ({ pharmacy } = requestQueues([prescribed, legacy, none, dispensed]));
    expect(pharmacy.open.map((r) => r.encounterId)).toEqual(['encounter:3']);
    expect(pharmacy.completed).toMatchObject([{ encounterId: 'encounter:2', completedOn: dispensed.createdOn }]);
  });
});

describe('result alerts', () => {
  it('alerts only the clinician who ordered the test, and ends once the result is reviewed', () => {
    const order = entry('encounter:5', 'lab_order', { tests: ['Full blood count'] }, 'staff:ordering');
    const result = entry('encounter:5', 'lab_results', { results: [{ test: 'Full blood count', result: 'Normal' }] }, 'staff:lab');
    expect(resultAlerts([order, result], 'staff:ordering')).toMatchObject([{ id: result.id, encounterId: 'encounter:5', tests: ['Full blood count'] }]);
    expect(resultAlerts([order, result], 'staff:another-doctor')).toEqual([]);
    expect(resultAlerts([order], 'staff:ordering')).toEqual([]);
    const review = entry('encounter:5', 'result_review', { resultEntryIds: [result.id] }, 'staff:ordering');
    expect(resultAlerts([order, result, review], 'staff:ordering')).toEqual([]);
  });
});
