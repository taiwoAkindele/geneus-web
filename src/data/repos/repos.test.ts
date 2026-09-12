import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthorizationContext, Staff } from '@shared';
import { authorizationFor, AuthorizationError, nobody } from '@/auth/authorization';
import { recordServerContact } from '../deviceCredential';
import { ContractError } from '../db';
import { setDatabaseForTests } from '../database';
import { fakeDatabase, type FakeDatabase } from '../testing/fakeDatabase';
import { book } from './appointments';
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
    db = fakeDatabase({ staff: [existingNurse], roster_shifts: [existingShift], register_definitions: [publishedRegister] });
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
      expect(db.statements[0].sql).toMatch(/^UPDATE roster_shifts SET extendedUntil = \?, updatedBy = \?, updatedOn = \? WHERE id = \?$/);
    });

    it('a record that fails the contract is refused before any write', async () => {
      await expect(
        book({ patientId: 'not-a-patient-id', reason: 'Review' }, contextFor('nurse')),
      ).rejects.toBeInstanceOf(ContractError);
      expect(db.statements).toEqual([]);
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
      expect(statement.sql).toBe('UPDATE staff SET permission = ?, updatedBy = ?, updatedOn = ? WHERE id = ?');
      expect(statement.parameters[0]).toBe('read_only');
      expect(statement.parameters[1]).toBe('staff:facility_admin');
      expect(statement.parameters[3]).toBe('staff:nurse');
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
