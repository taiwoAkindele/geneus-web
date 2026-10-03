import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthorizationContext, Staff, SyncRejection } from '@shared';
import { authorizationFor, AuthorizationError } from '@/auth/authorization';
import { kindOf } from '@/features/reconcile';
import { recordServerContact } from '../deviceCredential';
import { setDatabaseForTests } from '../database';
import { fakeDatabase, type FakeDatabase } from '../testing/fakeDatabase';
import { applyDeviceValues, heldFor, planRestore, reRegisterPatient, resolveRejection } from './syncRejections';

const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const contextFor = (role: Staff['role']): AuthorizationContext =>
  authorizationFor({ staff: { staffId: `staff:${role}`, role, permission: 'read_write' }, facilityId: 'OOE-PHC', deviceId: 'device-3' });

const rejection = (overrides: Partial<SyncRejection>): SyncRejection => ({
  id: `sync_rejection:${Math.random()}`,
  type: 'sync_rejection',
  facilityId: 'OOE-PHC',
  schemaVersion: 3,
  createdBy: 'system',
  createdOn: ago(HOUR),
  deviceId: 'device-2',
  entityType: 'patient',
  entityId: 'OOE-PHC-000047-K2',
  operation: 'put',
  category: 'conflict',
  reason: 'a record with this identity already exists — created on another device first',
  ...overrides,
});

const envelope = { facilityId: 'OOE-PHC', schemaVersion: 3, deviceId: 'device-2' };

const refusedPatient = rejection({
  refusedRecord: {
    ...envelope,
    id: 'OOE-PHC-000047-K2',
    type: 'patient',
    createdBy: 'staff:records_officer',
    createdOn: '2026-10-02T09:00:00.000Z',
    patientId: 'OOE-PHC-000047-K2',
    fullName: 'Bisi Adeyemi',
    address: 'Ring Road',
    sex: 'female',
    ageYears: 41,
  },
});

const heldEncounter = rejection({
  entityType: 'encounter',
  entityId: 'encounter:old',
  reason: 'held: this device’s registration of patient OOE-PHC-000047-K2 was refused',
  refusedRecord: {
    ...envelope,
    id: 'encounter:old',
    type: 'encounter',
    createdBy: 'staff:nurse',
    createdOn: '2026-10-02T09:05:00.000Z',
    patientId: 'OOE-PHC-000047-K2',
    openedOn: '2026-10-02T09:05:00.000Z',
  },
});

const heldEntry = (id: string, step: string, values: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
  rejection({
    entityType: 'encounter_entry',
    entityId: id,
    reason: 'held: this device’s registration of patient OOE-PHC-000047-K2 was refused',
    refusedRecord: {
      ...envelope,
      id,
      type: 'encounter_entry',
      createdBy: 'staff:nurse',
      createdOn: '2026-10-02T09:05:00.000Z',
      encounterId: 'encounter:old',
      patientId: 'OOE-PHC-000047-K2',
      step,
      actorRole: 'nurse',
      values,
      ...extra,
    },
  });

const vitals = heldEntry('encounter_entry:vitals', 'vitals', { temperatureC: 38.9 });
const amendment = heldEntry('encounter_entry:amend', 'amendment', { note: 'Was 37.9' }, {
  amends: 'encounter_entry:vitals',
  createdOn: '2026-10-02T09:10:00.000Z',
});
const unrelated = rejection({ deviceId: 'device-9', entityType: 'encounter', entityId: 'encounter:x', refusedRecord: { patientId: 'OOE-PHC-000047-K2' } });

describe('the reconcile queue', () => {
  it('sorts each refusal into the decision it needs', () => {
    expect(kindOf(refusedPatient)).toBe('patient_id_clash');
    expect(kindOf(heldEncounter)).toBe('held');
    expect(kindOf(rejection({ operation: 'patch', conflicts: [{ column: 'phone', deviceValue: '1', serverValue: '2' }] }))).toBe('column_conflict');
    expect(kindOf(rejection({ category: 'authorization', refusedRecord: undefined }))).toBe('review');
  });

  it('finds what the same device recorded for the refused patient, and nothing from other devices', () => {
    expect(heldFor(refusedPatient, [refusedPatient, heldEncounter, vitals, unrelated])).toEqual([heldEncounter, vitals]);
  });
});

describe('restoring a patient who lost their ID', () => {
  let counter = 0;
  const mint = (type: string) => `${type}:new-${(counter += 1)}`;

  it('gives everything new ids, follows every link, and keeps who recorded it and when', () => {
    counter = 0;
    const plan = planRestore(refusedPatient, [amendment, vitals, heldEncounter], 'OOE-PHC-000048-AB', 'device-3', mint as never);

    expect(plan.map(({ type }) => type)).toEqual(['patient', 'encounter', 'encounter_entry', 'encounter_entry']);
    const [patient, encounter, restoredVitals, restoredAmendment] = plan.map(({ record }) => record);
    expect(patient).toMatchObject({ id: 'OOE-PHC-000048-AB', patientId: 'OOE-PHC-000048-AB', deviceId: 'device-3', fullName: 'Bisi Adeyemi' });
    expect(encounter).toMatchObject({ patientId: 'OOE-PHC-000048-AB', createdBy: 'staff:nurse', createdOn: '2026-10-02T09:05:00.000Z' });
    expect(restoredVitals.encounterId).toBe(encounter.id);
    expect(restoredAmendment.amends).toBe(restoredVitals.id);
    expect(plan.every(({ record }) => record.deviceId === 'device-3')).toBe(true);
  });

  it('points a restored follow-up at its restored appointment', () => {
    counter = 0;
    const appointment = rejection({
      entityType: 'appointment',
      entityId: 'appointment:old',
      reason: 'held: …',
      refusedRecord: { ...envelope, id: 'appointment:old', type: 'appointment', createdBy: 'staff:doctor', createdOn: '2026-10-02T09:20:00.000Z', patientId: 'OOE-PHC-000047-K2', reason: 'Review', status: 'scheduled', scheduledFor: '2026-10-09T08:00:00.000Z' },
    });
    const followUp = heldEntry('encounter_entry:close', 'follow_up', { followUpOn: '2026-10-09', appointmentId: 'appointment:old' }, { createdOn: '2026-10-02T09:20:00.000Z' });

    const plan = planRestore(refusedPatient, [followUp, appointment], 'OOE-PHC-000048-AB', 'device-3', mint as never);

    const restoredAppointment = plan.find(({ type }) => type === 'appointment')?.record;
    const restoredFollowUp = plan.find(({ type }) => type === 'encounter_entry')?.record;
    expect((restoredFollowUp?.values as Record<string, unknown>).appointmentId).toBe(restoredAppointment?.id);
  });
});

describe('resolving', () => {
  let db: FakeDatabase;

  beforeEach(() => {
    recordServerContact(ago(HOUR));
    db = fakeDatabase({
      patients: [{ ...refusedPatient.refusedRecord, fullName: 'Amaka Okoro', dobEstimated: 0, allergies: '[]' }],
      sync_rejections: [refusedPatient, heldEncounter, vitals],
    });
    setDatabaseForTests(db);
  });

  afterEach(() => setDatabaseForTests(undefined));

  it('only lets those who reconcile close a rejection', async () => {
    await expect(resolveRejection(refusedPatient, 'Reviewed', contextFor('nurse'))).rejects.toBeInstanceOf(AuthorizationError);
    expect(db.statements).toEqual([]);

    await resolveRejection(refusedPatient, 'Reviewed', contextFor('records_officer'));
    expect(db.statements[0].sql).toMatch(/^UPDATE sync_rejections SET "resolvedOn" = \?, "resolvedBy" = \?, "resolution" = \?/);
  });

  it('re-registers under the next ID, restores what was held, and closes all of it', async () => {
    const patient = await reRegisterPatient(refusedPatient, [refusedPatient, heldEncounter, vitals], contextFor('records_officer'));

    expect(patient.patientId).toMatch(/^OOE-PHC-000048-[A-Z2-9]{2}$/);
    const writes = db.statements.map((statement) => statement.sql.split(' ').slice(0, 3).join(' '));
    expect(writes).toEqual([
      'INSERT INTO patients',
      'INSERT INTO encounters',
      'INSERT INTO encounter_entries',
      'UPDATE sync_rejections SET',
      'UPDATE sync_rejections SET',
      'UPDATE sync_rejections SET',
    ]);
  });

  it('puts the ticked device values back with the record’s own permission', async () => {
    const conflict = rejection({
      operation: 'patch',
      conflicts: [
        { column: 'phone', deviceValue: '0803', serverValue: '0805' },
        { column: 'address', deviceValue: 'Ring Road', serverValue: 'Odo-Ona' },
      ],
    });
    db.rows.sync_rejections.push(conflict);

    await expect(applyDeviceValues(conflict, ['phone'], contextFor('nurse'))).rejects.toBeInstanceOf(AuthorizationError);
    expect(db.statements).toEqual([]);
    await applyDeviceValues(conflict, ['phone'], contextFor('facility_admin'));

    expect(db.statements[0].sql).toMatch(/^UPDATE patients SET "phone" = \?/);
    expect(db.statements[0].parameters[0]).toBe('0803');
    expect(db.statements[1].sql).toMatch(/^UPDATE sync_rejections/);
  });
});
