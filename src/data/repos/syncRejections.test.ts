import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthorizationContext, Staff, SyncRejection } from '@shared';
import { authorizationFor, AuthorizationError } from '@/auth/authorization';
import { kindOf } from '@/features/reconcile';
import { recordServerContact } from '../deviceCredential';
import { setDatabaseForTests } from '../database';
import { fakeDatabase, type FakeDatabase } from '../testing/fakeDatabase';
import {
  applyAgain,
  applyAgainBlocker,
  applyDeviceValues,
  discardRejection,
  heldFor,
  planRestore,
  reRegisterPatient,
  resolveRejection,
  withHeldEdits,
} from './syncRejections';

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
  it('sorts each refusal into the decision it needs — none is just dropped', () => {
    expect(kindOf(refusedPatient)).toBe('patient_id_clash');
    expect(kindOf(heldEncounter, [refusedPatient, heldEncounter])).toBe('held');
    expect(kindOf(rejection({ operation: 'patch', conflicts: [{ column: 'phone', deviceValue: '1', serverValue: '2' }] }))).toBe('column_conflict');
    expect(kindOf(rejection({ category: 'authorization', operation: 'patch', refusedChanges: { phone: '0803' } }))).toBe('refused_write');
    expect(kindOf(rejection({ category: 'authorization', operation: 'delete', refusedRecord: undefined }))).toBe('nothing_kept');
  });

  /** Once its patient's clash is decided (or discarded), a held record is decided on its own — never stranded. */
  it('frees a held record once its patient is no longer open', () => {
    expect(kindOf(heldEncounter, [heldEncounter])).toBe('refused_write');
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

  const columnsOf = (sql: string) => (/\(([^)]+)\)/.exec(sql)?.[1].split(', ') ?? []).map((name) => name.replace(/"/g, ''));

  /** A nurse deactivated while the device was offline: her correction is not lost, it waits for a decision. */
  it('applies a refused change again, in the name of the person applying it', async () => {
    const refusedEdit = rejection({
      operation: 'patch',
      category: 'authorization',
      attributedTo: 'staff:chew',
      reason: 'staff:chew is deactivated',
      refusedChanges: { phone: '0809' },
    });
    db.rows.sync_rejections.push(refusedEdit);

    await applyAgain(refusedEdit, contextFor('records_officer'));

    expect(db.statements[0].sql).toMatch(/^UPDATE patients SET "phone" = \?, "updatedBy" = \?/);
    expect(db.statements[0].parameters.slice(0, 2)).toEqual(['0809', 'staff:records_officer']);
    expect(db.statements[1].parameters).toContain('Applied again');
  });

  it('saves a refused record again under the person applying it, keeping when it first happened', async () => {
    const refusedStep = rejection({
      entityType: 'encounter_entry',
      entityId: 'encounter_entry:refused',
      category: 'authorization',
      attributedTo: 'staff:nurse',
      reason: 'staff:nurse is deactivated',
      refusedRecord: { ...vitals.refusedRecord, id: 'encounter_entry:refused' },
    });
    db.rows.sync_rejections.push(refusedStep);

    await applyAgain(refusedStep, contextFor('facility_admin'));

    const [insert] = db.statements;
    const columns = columnsOf(insert.sql);
    expect(insert.sql).toMatch(/^INSERT INTO encounter_entries/);
    expect(insert.parameters[columns.indexOf('createdBy')]).toBe('staff:facility_admin');
    expect(insert.parameters[columns.indexOf('actorRole')]).toBe('facility_admin');
    expect(insert.parameters[columns.indexOf('deviceId')]).toBe('device-3');
    expect(insert.parameters[columns.indexOf('createdOn')]).toBe('2026-10-02T09:05:00.000Z');
  });

  it('says plainly who can apply it again, and offers only discarding when nothing was kept', () => {
    const clinical = rejection({ entityType: 'encounter_entry', refusedRecord: vitals.refusedRecord });

    expect(applyAgainBlocker(clinical, contextFor('records_officer'))).toMatch(/whose role can/);
    // A clinician may record the step but not resolve the queue (sync_rejection:resolve), so cannot apply it.
    expect(applyAgainBlocker(clinical, contextFor('nurse'))).toMatch(/records officer or facility admin/);
    expect(applyAgainBlocker(clinical, contextFor('facility_admin'))).toBeUndefined();
    expect(applyAgainBlocker(rejection({ operation: 'delete', refusedRecord: undefined }), contextFor('facility_admin'))).toMatch(/only be discarded/);
  });

  it('records a discard in the name of the person who discarded it', async () => {
    await discardRejection(refusedPatient, contextFor('records_officer'));

    const [update] = db.statements;
    expect(update.sql).toMatch(/^UPDATE sync_rejections SET "resolvedOn" = \?, "resolvedBy" = \?, "resolution" = \?/);
    expect(update.parameters.slice(1, 3)).toEqual(['staff:records_officer', 'Discarded']);
  });

  it('carries held edits onto the re-registered patient, in the order they were made', () => {
    const edit = (phone: string, occurredOn: string) =>
      rejection({ operation: 'patch', reason: 'held: …', occurredOn, refusedChanges: { phone } });

    const merged = withHeldEdits(refusedPatient, [edit('0805', '2026-10-02T11:00:00.000Z'), edit('0803', '2026-10-02T10:00:00.000Z')]);

    expect(merged.refusedRecord).toMatchObject({ fullName: 'Bisi Adeyemi', phone: '0805' });
  });
});
