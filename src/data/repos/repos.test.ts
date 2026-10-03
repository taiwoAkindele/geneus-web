import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthorizationContext, Staff } from '@shared';
import { authorizationFor, AuthorizationError, nobody } from '@/auth/authorization';
import { recordServerContact } from '../deviceCredential';
import { ContractError } from '../db';
import { setDatabaseForTests } from '../database';
import { fakeDatabase, type FakeDatabase } from '../testing/fakeDatabase';
import { book } from './appointments';
import { amendEntry, saveStep } from './encounters';
import { handoffsTo, markHandoff, sendHandoff } from './handoffs';
import { createUnit, setUnitActive } from './units';
import { registerPatient, updatePatient, type PatientDetails } from './patients';
import { addEntry, publishDefinition } from './registers';
import { assignShift, createStaff, extendShift, removeStaff, setPermission } from './staff';

const HOUR = 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

const contextFor = (role: Staff['role'], permission: Staff['permission'] = 'read_write'): AuthorizationContext =>
  authorizationFor({ staff: { staffId: `staff:${role}`, role, permission }, facilityId: 'OOE-PHC', deviceId: 'device-1' });

const existingNurse: Staff = {
  id: 'staff:nurse',
  type: 'staff',
  facilityId: 'OOE-PHC',
  schemaVersion: 3,
  createdBy: 'staff:facility_admin',
  createdOn: ago(HOUR),
  deviceId: 'device-1',
  staffId: 'staff:nurse',
  fullName: 'Nurse',
  role: 'nurse',
  permission: 'read_write',
  active: true,
};

const publishedRegister = {
  id: 'register:opd:v1',
  type: 'register_definition',
  facilityId: 'OOE-PHC',
  schemaVersion: 3,
  createdBy: 'staff:facility_admin',
  createdOn: ago(HOUR),
  deviceId: 'device-1',
  registerId: 'register:opd',
  version: 1,
  name: 'OPD',
  category: 'General',
  description: '',
  status: 'published',
  fields: '[]',
};

const existingPatient = {
  id: 'OOE-PHC-000047-K2',
  type: 'patient',
  facilityId: 'OOE-PHC',
  schemaVersion: 3,
  createdBy: 'staff:records_officer',
  createdOn: ago(HOUR),
  deviceId: 'device-2',
  patientId: 'OOE-PHC-000047-K2',
  fullName: 'Amaka Okoro',
  address: 'Odo-Ona',
  sex: 'female',
  ageYears: 32,
  dobEstimated: 0,
  allergies: '[]',
  phone: '0801',
};

const newPatient: PatientDetails = { fullName: 'Bisi Adeyemi', address: 'Ring Road', sex: 'female', ageYears: 41 };

const existingShift = {
  id: 'roster_shift:staff:nurse:2026-09-12',
  type: 'roster_shift',
  facilityId: 'OOE-PHC',
  schemaVersion: 3,
  createdBy: 'staff:facility_admin',
  createdOn: ago(HOUR),
  deviceId: 'device-1',
  staffId: 'staff:nurse',
  startsAt: '2026-09-12T08:00:00Z',
  endsAt: '2026-09-12T16:00:00Z',
};

/**
 * The repositories are the write boundary (migration plan §28): every one of
 * these proves what reached the database — and, for a refusal, that nothing
 * did. The fake records statements; an empty list is the assertion.
 */
describe('repositories', () => {
  let db: FakeDatabase;

  beforeEach(() => {
    recordServerContact(ago(HOUR));
    db = fakeDatabase({
      staff: [existingNurse],
      roster_shifts: [existingShift],
      register_definitions: [publishedRegister],
      patients: [existingPatient],
    });
    setDatabaseForTests(db);
  });

  afterEach(() => setDatabaseForTests(undefined));

  describe('denied writes', () => {
    it('a nurse cannot add staff — and nothing is written', async () => {
      await expect(createStaff({ fullName: 'X', role: 'doctor', permission: 'read_write' }, contextFor('nurse'))).rejects.toBeInstanceOf(AuthorizationError);
      expect(db.statements).toEqual([]);
    });

    it('read-only staff cannot record a register entry or book an appointment', async () => {
      const readOnly = contextFor('nurse', 'read_only');
      await expect(book({ patientId: 'OOE-PHC-000001-K2', reason: 'Review' }, readOnly)).rejects.toBeInstanceOf(AuthorizationError);
      await expect(addEntry({ registerId: 'register:opd', values: {} }, readOnly)).rejects.toBeInstanceOf(AuthorizationError);
      expect(db.statements).toEqual([]);
    });

    it('nobody signed in cannot write anything', async () => {
      await expect(book({ patientId: 'OOE-PHC-000001-K2', reason: 'Review' }, nobody('OOE-PHC', 'device-1'))).rejects.toBeInstanceOf(AuthorizationError);
      expect(db.statements).toEqual([]);
    });

    it('an admin whose device has not checked in for 25 hours cannot change staff, but can still register a patient', async () => {
      recordServerContact(ago(25 * HOUR));
      const admin = { ...contextFor('facility_admin'), lastServerContactOn: undefined };

      await expect(setPermission(existingNurse, 'read_only', admin)).rejects.toBeInstanceOf(AuthorizationError);
      expect(db.statements).toEqual([]);
      await expect(book({ patientId: 'OOE-PHC-000001-K2', reason: 'Review' }, admin)).resolves.toBeTruthy();
      expect(db.statements).toHaveLength(1);
    });

    it('a nurse cannot extend a shift; a supervisor can', async () => {
      await expect(extendShift(existingShift as never, '2026-09-12T20:00:00Z', contextFor('nurse'))).rejects.toBeInstanceOf(AuthorizationError);
      expect(db.statements).toEqual([]);

      await extendShift(existingShift as never, '2026-09-12T20:00:00Z', contextFor('supervisor'));
      expect(db.statements[0].sql).toMatch(/^UPDATE roster_shifts SET extendedUntil = \?, updatedBy = \?, updatedOn = \?, _metadata = \? WHERE id = \?$/);
    });

    it('read-only staff cannot register a patient', async () => {
      await expect(registerPatient(newPatient, contextFor('records_officer', 'read_only'))).rejects.toBeInstanceOf(AuthorizationError);
      expect(db.statements).toEqual([]);
    });

    it('a record that fails the contract is refused before any write', async () => {
      await expect(
        book({ patientId: 'not-a-patient-id', reason: 'Review' }, contextFor('nurse')),
      ).rejects.toBeInstanceOf(ContractError);
      expect(db.statements).toEqual([]);
    });
  });

  describe('encounters', () => {
    const patientId = existingPatient.id;
    const tables = () => db.statements.map((statement) => /^INSERT INTO (\w+)/.exec(statement.sql)?.[1]);

    it('opens the encounter with its first saved step, stamped with the role held', async () => {
      const entry = await saveStep({ patientId, step: 'vitals', values: { temperatureC: 38.9 } }, contextFor('nurse'));

      expect(tables()).toEqual(['encounters', 'encounter_entries']);
      expect(entry).toMatchObject({ step: 'vitals', actorRole: 'nurse', createdBy: 'staff:nurse' });
      expect(entry.encounterId).toMatch(/^encounter:/);
    });

    it('adds later steps to the same encounter, writing nothing else', async () => {
      await saveStep({ encounterId: 'encounter:1', patientId, step: 'diagnosis', values: { diagnosis: 'Malaria' } }, contextFor('doctor'));

      expect(tables()).toEqual(['encounter_entries']);
    });

    it('books the follow-up in the same save that closes the encounter', async () => {
      const entry = await saveStep(
        {
          encounterId: 'encounter:1',
          patientId,
          step: 'follow_up',
          values: { followUpOn: '2026-10-09' },
          followUp: { reason: 'Malaria review', scheduledFor: '2026-10-09T08:00:00.000Z' },
        },
        contextFor('doctor'),
      );

      expect(tables()).toEqual(['appointments', 'encounter_entries']);
      expect(entry.values.appointmentId).toMatch(/^appointment:/);
    });

    it('writes nothing — not even the encounter — when the first step fails the contract', async () => {
      await expect(saveStep({ patientId, step: 'vitals', values: {} }, contextFor('nurse'))).rejects.toBeInstanceOf(ContractError);
      expect(db.statements).toEqual([]);
    });

    it('refuses the front desk recording a clinical step', async () => {
      await expect(
        saveStep({ patientId, step: 'vitals', values: { pulseBpm: 80 } }, contextFor('records_officer')),
      ).rejects.toBeInstanceOf(AuthorizationError);
      expect(db.statements).toEqual([]);
    });

    it('corrects a saved step by adding an amendment, never by updating it', async () => {
      const vitals = await saveStep(
        { encounterId: 'encounter:1', patientId, step: 'vitals', values: { temperatureC: 38.9 } },
        contextFor('nurse'),
      );
      db.statements.length = 0;

      const amendment = await amendEntry(vitals, 'Temperature was 37.9', contextFor('nurse'));

      expect(amendment).toMatchObject({ step: 'amendment', amends: vitals.id, encounterId: 'encounter:1' });
      expect(db.statements.every((statement) => statement.sql.startsWith('INSERT'))).toBe(true);
    });
  });

  describe('units and handoffs', () => {
    const consultation = {
      id: 'unit:consultation',
      type: 'unit',
      facilityId: 'OOE-PHC',
      schemaVersion: 3,
      createdBy: 'staff:facility_admin',
      createdOn: ago(HOUR),
      deviceId: 'device-1',
      unitId: 'unit:consultation',
      name: 'Consultation',
      active: 1,
    };

    beforeEach(() => {
      db.rows.units = [consultation];
    });

    it('lets the admin add a unit, and refuses a nurse', async () => {
      await expect(createUnit('Injection Room', contextFor('nurse'))).rejects.toBeInstanceOf(AuthorizationError);
      expect(db.statements).toEqual([]);

      const unit = await createUnit('  Injection Room ', contextFor('facility_admin'));
      expect(unit).toMatchObject({ name: 'Injection Room', active: true });
      expect(unit.id).toBe(unit.unitId);
    });

    it('refuses a second active unit with the same name', async () => {
      await expect(createUnit('consultation', contextFor('facility_admin'))).rejects.toThrow(/already a unit/);
      expect(db.statements).toEqual([]);
    });

    it('retires a unit by flag, never by delete', async () => {
      await setUnitActive(consultation as never, false, contextFor('facility_admin'));

      expect(db.statements[0].sql).toMatch(/^UPDATE units SET active = \?/);
      expect(db.statements[0].parameters[0]).toBe(0);
    });

    it('sends a patient with the instruction and the encounter they are in', async () => {
      const handoff = await sendHandoff(
        {
          patientId: existingPatient.id,
          encounterId: 'encounter:1',
          fromUnitId: 'unit:consultation',
          toUnitId: 'unit:injection',
          instruction: ' Give TT injection ',
        },
        contextFor('nurse'),
      );

      expect(handoff).toMatchObject({ status: 'pending', instruction: 'Give TT injection', encounterId: 'encounter:1' });
      expect(db.statements[0].sql).toMatch(/^INSERT INTO handoffs/);
    });

    it('refuses sending a patient to the unit they are already in', () => {
      expect(() =>
        sendHandoff(
          { patientId: existingPatient.id, fromUnitId: 'unit:consultation', toUnitId: 'unit:consultation', instruction: 'x' },
          contextFor('nurse'),
        ),
      ).toThrow(/different unit/);
    });

    it('marks a handoff arrived by changing only its status', async () => {
      db.rows.handoffs = [
        {
          id: 'handoff:1',
          type: 'handoff',
          facilityId: 'OOE-PHC',
          schemaVersion: 3,
          createdBy: 'staff:nurse',
          createdOn: ago(HOUR),
          deviceId: 'device-1',
          patientId: existingPatient.id,
          fromUnitId: 'unit:consultation',
          toUnitId: 'unit:injection',
          instruction: 'Give TT injection',
          status: 'pending',
        },
      ];
      const [pending] = await handoffsTo('unit:injection');

      await markHandoff(pending, 'received', contextFor('nurse'));

      expect(db.statements[0].sql).toBe('UPDATE handoffs SET status = ?, updatedBy = ?, updatedOn = ?, _metadata = ? WHERE id = ?');
      expect(await handoffsTo('unit:pharmacy')).toEqual([]);
    });
  });

  describe('allowed writes', () => {
    it('inserts a fully stamped record, booleans as integers', async () => {
      const staff = await createStaff({ fullName: 'Amaka', role: 'doctor', permission: 'read_write' }, contextFor('facility_admin'));

      expect(staff).toMatchObject({ facilityId: 'OOE-PHC', deviceId: 'device-1', createdBy: 'staff:facility_admin', schemaVersion: 3, active: true });
      const [statement] = db.statements;
      expect(statement.sql).toMatch(/^INSERT INTO staff \(/);
      const columns = /\(([^)]+)\)/.exec(statement.sql)?.[1].split(', ') ?? [];
      expect(statement.parameters[columns.indexOf('active')]).toBe(1);
      expect(statement.parameters[columns.indexOf('facilityId')]).toBe('OOE-PHC');
    });

    it('updates only the changed columns plus who and when', async () => {
      await setPermission(existingNurse, 'read_only', contextFor('facility_admin'));

      const [statement] = db.statements;
      expect(statement.sql).toBe('UPDATE staff SET permission = ?, updatedBy = ?, updatedOn = ?, _metadata = ? WHERE id = ?');
      expect(statement.parameters[0]).toBe('read_only');
      expect(statement.parameters[1]).toBe('staff:facility_admin');
      // The actor also rides in PowerSync's write metadata, for PATCHes that omit updatedBy.
      expect(statement.parameters[3]).toBe('staff:facility_admin');
      expect(statement.parameters[4]).toBe('staff:nurse');
    });

    it('deactivates by flag, never by delete', async () => {
      await removeStaff(existingNurse, contextFor('facility_admin'));

      expect(db.statements[0].sql).toMatch(/^UPDATE staff SET active = \?/);
      expect(db.statements[0].parameters[0]).toBe(0);
      expect(db.statements.some((statement) => /DELETE/i.test(statement.sql))).toBe(false);
    });

    it('replaces an existing shift with an update and creates a missing one with an insert', async () => {
      const admin = contextFor('facility_admin');
      await assignShift({ staffId: 'staff:nurse', day: '2026-09-12', startsAt: '2026-09-12T09:00:00Z', endsAt: '2026-09-12T17:00:00Z' }, admin);
      await assignShift({ staffId: 'staff:nurse', day: '2026-09-13', startsAt: '2026-09-13T09:00:00Z', endsAt: '2026-09-13T17:00:00Z' }, admin);

      expect(db.statements[0].sql).toMatch(/^UPDATE roster_shifts SET startsAt = \?, endsAt = \?/);
      expect(db.statements[1].sql).toMatch(/^INSERT INTO roster_shifts/);
      expect(db.statements[1].sql).not.toMatch(/signature/);
    });

    it('registers a patient under the next Patient ID, numbered after one synced from another device', async () => {
      const patient = await registerPatient(newPatient, contextFor('records_officer'));

      expect(patient.patientId).toMatch(/^OOE-PHC-000048-[A-Z2-9]{2}$/);
      expect(patient.id).toBe(patient.patientId);
      const [statement] = db.statements;
      expect(statement.sql).toMatch(/^INSERT INTO patients/);
    });

    it('saves only the patient fields that changed', async () => {
      await updatePatient(
        existingPatient.id,
        { fullName: 'Amaka Okoro', address: 'Ring Road', sex: 'female', ageYears: 32, phone: '0801' },
        contextFor('records_officer'),
      );

      expect(db.statements[0].sql).toBe('UPDATE patients SET address = ?, updatedBy = ?, updatedOn = ?, _metadata = ? WHERE id = ?');
    });

    it('writes nothing when no patient field changed', async () => {
      await updatePatient(existingPatient.id, { fullName: 'Amaka Okoro', address: 'Odo-Ona', sex: 'female', ageYears: 32 }, contextFor('records_officer'));

      expect(db.statements).toEqual([]);
    });

    it('publishes a register definition as a new version with its fields as JSON', async () => {
      const definition = await publishDefinition(
        { name: 'OPD', category: 'General', description: '', fields: [{ id: 'f1', type: 'text', label: 'Name', required: true }] },
        'register:opd',
        contextFor('records_officer'),
      );

      expect(definition.id).toBe('register:opd:v2');
      const [statement] = db.statements;
      const columns = /\(([^)]+)\)/.exec(statement.sql)?.[1].split(', ') ?? [];
      expect(statement.parameters[columns.indexOf('fields')]).toBe(JSON.stringify(definition.fields));
    });
  });
});
