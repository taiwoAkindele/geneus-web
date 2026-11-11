import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Encounter, EncounterEntry, Patient, Unit, Location, type WardCareEvent } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests } from '@/lib/secureStorage';
import { recordServerContact } from './deviceCredential';
import { setDatabaseForTests } from './database';
import { sqliteTestDatabase } from './testing/sqliteDatabase';
import { rememberInpatientSupport } from './inpatientSupport';
import { rememberWardCareSupport } from './wardCareSupport';
import { confirmAdmission, changeAdmission } from './repos/inpatient';
import { readWardRecords, saveWardStep, saveWardEvent, type WardSession } from './repos/wardCare';
import { allOfType } from './db';
import { monthlyReport } from '@/modules/reports/reporting/monthlyReport';
import { calendarDate } from '@/lib/calendarDate';

const context = (readOnly = false) => authorizationFor({ staff: { staffId: 'staff:doctor', role: 'doctor', permission: readOnly ? 'read_only' : 'read_write' }, facilityId: 'TEST', deviceId: 'device:one' });
const base = () => ({ facilityId: 'TEST', schemaVersion: 5, createdBy: 'staff:doctor', deviceId: 'device:one', createdOn: new Date().toISOString() });
const patientId = 'TEST-000001-K2';

describe('continuing inpatient care against real SQLite', () => {
  let storage: ReturnType<typeof sqliteTestDatabase>, admissionId: string;
  const session = (purpose: WardSession['purpose'] = 'review'): WardSession => ({ id: 'encounter:' + crypto.randomUUID(), admissionId, patientId, purpose });
  beforeEach(async () => {
    vi.stubGlobal('localStorage', memoryStorage()); resetSecureStorageForTests(); recordServerContact(new Date().toISOString());
    storage = sqliteTestDatabase(); setDatabaseForTests(storage.db); rememberInpatientSupport(context(), 1); rememberWardCareSupport(context(), 1);
    await storage.seed(Patient.parse({ ...base(), type: 'patient', id: patientId, patientId, fullName: 'Synthetic inpatient', sex: 'female', address: 'Synthetic address', ageYears: 30 }));
    await storage.seed(Encounter.parse({ ...base(), id: 'visit:source', type: 'encounter', patientId, openedOn: new Date().toISOString() }));
    const request = EncounterEntry.parse({ ...base(), id: 'entry:request', type: 'encounter_entry', encounterId: 'visit:source', patientId, actorRole: 'doctor', step: 'admission', values: { ward: 'Ward A', note: 'Recorded admission reason' } });
    await storage.seed(request);
    await storage.seed(Unit.parse({ ...base(), id: 'unit:ward', type: 'unit', unitId: 'WARD', name: 'Ward team', active: true }));
    await storage.seed(Location.parse({ ...base(), id: 'ward:a', type: 'location', kind: 'ward', name: 'Ward A' }));
    await storage.seed(Location.parse({ ...base(), id: 'bed:one', type: 'location', kind: 'bed', name: 'Bed 1', parentId: 'ward:a' }));
    const confirmed = await confirmAdmission(request, 'unit:ward', '', context()); admissionId = confirmed.id;
    const reserved = await changeAdmission(confirmed, 'reserve', context(), { wardId: 'ward:a', bedId: 'bed:one' }); await changeAdmission(reserved, 'arrive', context());
  });
  afterEach(async () => { setDatabaseForTests(undefined); await storage.db.close(); vi.unstubAllGlobals(); });
  const prescribe = async () => {
    const review = session(); await saveWardStep(review, 'complaint', { note: 'Current ward assessment' }, context());
    await saveWardStep(review, 'prescription', { decision: 'prescribed', prescription: [{ drug: 'Synthetic medicine', dose: 'Recorded dose', route: 'Oral' }] }, context());
    const order = (await readWardRecords(admissionId)).events.find((e) => e.values.kind === 'medication')!;
    return { review, order };
  };
  it('records nursing checks after the original consultation closes without creating outpatient attendances', async () => {
    await saveWardStep(session('nursing'), 'complaint', { note: 'Evening nursing review' }, context());
    await saveWardStep(session('nursing'), 'vitals', { temperatureC: 36.8 }, context());
    const data = await readWardRecords(admissionId);
    expect(data.events.filter((e) => e.values.kind === 'complete')).toHaveLength(2);
    expect(data.entries.find((e) => e.id === 'entry:request')?.values).toEqual({ ward: 'Ward A', note: 'Recorded admission reason' });
    const report = monthlyReport({ encounters: [...data.encounters], entries: [...data.entries], patients: [], identities: [], definitions: [], registerEntries: [], items: [], movements: [] }, calendarDate().slice(0, 7));
    expect(report.visits).toBe(1); expect(await allOfType('charge')).toHaveLength(0);
  });
  it('keeps original medication decisions and records actual doses and corrections separately', async () => {
    const { order } = await prescribe();
    const at = new Date().toISOString();
    const dose = await saveWardEvent(session('nursing'), { kind: 'administration', orderEventId: order.id, dose: 'Actual dose', route: 'Oral', outcome: 'given' }, context(), { occurredOn: at });
    await expect(saveWardEvent(session('nursing'), { kind: 'administration', orderEventId: order.id, dose: 'Actual dose', outcome: 'given' }, context(), { occurredOn: at })).rejects.toThrow(/already recorded/);
    await saveWardEvent(session('nursing'), { kind: 'administration', orderEventId: order.id, dose: 'Actual dose', outcome: 'not_given', reason: 'Corrected after review', previousId: dose.id }, context(), { occurredOn: at });
    const events = (await readWardRecords(admissionId)).events;
    expect(events.filter((e) => e.values.kind === 'administration')).toHaveLength(2);
    expect(events.find((e) => e.id === dose.id)?.values).toMatchObject({ outcome: 'given' });
    expect(await allOfType('stock_movement')).toHaveLength(0);
  });
  it('serializes order changes and refuses stale or stopped orders', async () => {
    const { order } = await prescribe(); if (order.values.kind !== 'medication') throw new Error('Expected order');
    const stopped = await saveWardEvent(session(), { ...order.values, action: 'stop', previousId: order.id, note: 'Stopped after review' }, context());
    await expect(saveWardEvent(session(), { ...order.values, action: 'continue', previousId: order.id }, context())).rejects.toThrow(/changed/);
    await expect(saveWardEvent(session('nursing'), { kind: 'administration', orderEventId: stopped.id, dose: 'Actual dose', outcome: 'given' }, context())).rejects.toThrow(/active medication/);
  });
  it('checks concurrent departure under the same write transaction, preserving the private proposal', async () => {
    const original = storage.db.writeTransaction; let raced = false;
    storage.db.writeTransaction = async (callback) => {
      if (!raced) {
        raced = true; const data = await readWardRecords(admissionId); const head = data.admissions.find((e) => e.action === 'arrive')!;
        await storage.seed({ ...head, id: 'departure:race', previousId: head.id, action: 'discharge' as const, departureException: 'Actual departure recorded elsewhere' });
      }
      return original(callback);
    };
    await expect(saveWardStep(session('nursing'), 'complaint', { note: 'Unaccepted proposal' }, context())).rejects.toThrow(/ended/);
    expect((await allOfType<Encounter>('encounter')).filter((e) => e.inpatientContext)).toHaveLength(0);
  });
  it('pins summary revisions, keeps the bed occupied until departure, and preserves the source history', async () => {
    await saveWardStep(session('nursing'), 'complaint', { note: 'Ward care' }, context());
    const records = await readWardRecords(admissionId), head = records.admissions.find((e) => e.action === 'arrive')!, original = records.admissions.find((e) => e.id === admissionId)!;
    await expect(changeAdmission(head, 'ready_for_discharge', context())).rejects.toThrow(/summary/);
    const values = { kind: 'discharge' as const, admissionReason: 'Recorded reason', diagnoses: 'Recorded diagnosis', course: 'Recorded course', instructions: 'Reviewed instructions', takeHome: [], sourceEntryIds: records.entries.map((e) => e.id), sourceWardEventIds: [], patientName: 'Synthetic inpatient', patientIdentifier: patientId, admittedOn: original.createdOn };
    const first = await saveWardEvent(session('discharge'), values, context());
    const revised = await saveWardEvent(session('discharge'), { ...values, previousId: first.id, instructions: 'Revised instructions' }, context());
    await expect(saveWardEvent(session('discharge'), { ...values, previousId: first.id }, context())).rejects.toThrow(/changed/);
    const ready = await changeAdmission(head, 'ready_for_discharge', context()); expect(ready.dischargeSummaryId).toBe(revised.id);
    expect((await readWardRecords(admissionId)).events.find((e) => e.id === first.id)?.values).toMatchObject({ instructions: 'Reviewed instructions' });
    await changeAdmission(ready, 'discharge', context());
    await expect(saveWardStep(session(), 'complaint', { note: 'New work after departure' }, context())).rejects.toThrow(/ended/);
  });
  it('prevents read-only writes and refuses ward care before server support is negotiated', async () => {
    await expect(saveWardStep(session('nursing'), 'complaint', { note: 'Forbidden' }, context(true))).rejects.toThrow();
    rememberWardCareSupport(context());
    await expect(saveWardStep(session('nursing'), 'complaint', { note: 'Unsupported' }, context())).rejects.toThrow(/Connect once/);
    expect(await allOfType<WardCareEvent>('ward_care_event')).toHaveLength(0);
  });
});
