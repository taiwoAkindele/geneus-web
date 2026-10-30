import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizationContext, DocType, Staff } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { fieldKindsFor } from './contractShape';
import { insertRecord, envelope, newId } from './db';
import { recordServerContact } from './deviceCredential';
import { setDatabaseForTests, type LocalDatabase } from './database';
import { discardDraft, discardDrafts, readDrafts, writeDraft } from './repos/drafts';
import { amendEntry, entriesForEncounter, saveStep } from './repos/encounters';
import { assignShift, createStaff, editStaff, extendShift, findShift, listShifts, listStaff } from './repos/staff';
import { registerPatient, updatePatient, getPatient } from './repos/patients';
import { fromPatient, toPatientDetails } from '@/features/registration/registrationValues';
import { identityReviewRecords, listIdentityEvents, patientIdentityIds } from './repos/patientIdentity';
import {
  balancesByCurrency, chargeBalances, chargesForPatient, createCharge, createFeeItem,
  isAppointmentConfirmed, listFeeItems, paymentsForPatient, recordPayment, reversePayment,
  setFeeItemActive, updateFeeItem, type FeeDraft,
  adjustCharge, adjustmentsForPatient,
} from './repos/billing';
import { book, changeAppointment, listAppointments } from './repos/appointments';
import { clinicalEventsForPatient, patientClinicalRecord, saveClinicalRecord } from './repos/clinical';
import { CLINICAL_REVIEWS_TABLE, DRAFTS_TABLE, REGISTER_DRAFTS_TABLE, TABLE_FOR } from './tables';
import { addEntry, listDefinitions, listEntries, publishDefinition, saveDraftDefinition } from './repos/registers';
import { discardRegisterRecovery, readRegisterRecovery, writeRegisterRecovery } from './repos/registerDrafts';
import { fakeDatabase } from './testing/fakeDatabase';

/**
 * Node's built-in SQLite (Node 22.5+) — no dependency. The app has no Node
 * types (it targets the browser), so the little used here is typed locally,
 * and the module name is a variable so neither TypeScript nor Vite resolves it.
 */
type Statement = { run: (...values: unknown[]) => unknown; all: (...values: unknown[]) => unknown[]; get: (...values: unknown[]) => unknown };
type NodeSqlite = { DatabaseSync: new (path: string) => { exec: (sql: string) => void; prepare: (sql: string) => Statement; close: () => void } };
const NODE_SQLITE = 'node:sqlite';
const { DatabaseSync } = (await import(/* @vite-ignore */ NODE_SQLITE)) as NodeSqlite;

/**
 * The repository tests use a fake that records SQL without parsing it, which
 * is how an unquoted `values` column (an SQL keyword) once reached the device
 * as a syntax error. These run the real repositories against a real SQLite,
 * with every contract table, so the SQL the write path builds must parse.
 */
const sqliteDatabase = (): LocalDatabase & { close: () => Promise<void> } => {
  const sqlite = new DatabaseSync(':memory:');
  for (const [type, table] of Object.entries(TABLE_FOR) as [DocType, string][]) {
    const columns = Object.keys(fieldKindsFor(type)).filter((field) => field !== 'id');
    sqlite.exec(`CREATE TABLE "${table}" ("id" TEXT PRIMARY KEY, ${[...columns, '_metadata'].map((name) => `"${name}"`).join(', ')})`);
  }
  sqlite.exec(`CREATE TABLE "${DRAFTS_TABLE}" ("id" TEXT PRIMARY KEY, "staffId", "patientId", "encounterKey", "step", "data", "updatedOn")`);
  sqlite.exec(`CREATE TABLE "${REGISTER_DRAFTS_TABLE}" ("id" TEXT PRIMARY KEY, "staffId", "registerKey", "data", "updatedOn")`);
  sqlite.exec(`CREATE TABLE "${CLINICAL_REVIEWS_TABLE}" ("id" TEXT PRIMARY KEY, "facilityId", "staffId", "semanticKey", "data")`);
  type Bindable = string | number | null;
  const bind = (parameters: unknown[]) => parameters.map((value) => (value === undefined ? null : value)) as Bindable[];
  return {
    ...fakeDatabase(),
    writeTransaction: async (callback) => {
      sqlite.exec('BEGIN');
      try { const result = await callback({ execute: async (sql, parameters = []) => sqlite.prepare(sql).run(...bind(parameters)),getOptional:async<T>(sql:string,parameters:unknown[]=[])=>sqlite.prepare(sql).get(...bind(parameters)) as T||null }); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
    execute: async (sql, parameters = []) => {
      sqlite.prepare(sql).run(...bind(parameters));
    },
    getAll: async <T,>(sql: string, parameters: unknown[] = []) => sqlite.prepare(sql).all(...bind(parameters)) as T[],
    getOptional: async <T,>(sql: string, parameters: unknown[] = []) =>
      (sqlite.prepare(sql).get(...bind(parameters)) ?? null) as T | null,
    close: async () => sqlite.close(),
  };
};

const contextFor = (role: Staff['role']): AuthorizationContext =>
  authorizationFor({ staff: { staffId: `staff:${role}`, role, permission: 'read_write' }, facilityId: 'OOE-PHC', deviceId: 'device-1' });

describe('the write path against a real SQLite', () => {
  let db: ReturnType<typeof sqliteDatabase>;

  beforeEach(() => {
    recordServerContact(new Date(Date.now() - 60_000).toISOString());
    db = sqliteDatabase();
    setDatabaseForTests(db);
  });

  afterEach(async () => {
    setDatabaseForTests(undefined);
    await db.close();
  });



  describe('staff sign-in access and full-day rosters', () => {
    it('persists 24-hour access without changing roles or write capabilities', async () => {
      const admin = contextFor('facility_admin');
      const staff = await createStaff({ fullName: 'Always Available', role: 'cashier', permission: 'read_write', loginAccess: 'always' }, admin);
      const loaded = (await listStaff()).find((item) => item.id === staff.id)!;
      expect(loaded.loginAccess).toBe('always');
      expect(authorizationFor({ staff: loaded, facilityId: admin.facilityId, deviceId: admin.deviceId }).permissions).toEqual(['payment:receive']);
      const delegate = authorizationFor({ staff: { ...loaded, additionalPermissions: ['staff:manage'] }, facilityId: admin.facilityId, deviceId: admin.deviceId });
      await expect(editStaff(loaded, { ...loaded, loginAccess: 'shift' }, delegate)).rejects.toThrow(/role doesn't allow/);
      expect((await listStaff()).find((item) => item.id === staff.id)?.loginAccess).toBe('always');
      await editStaff(loaded, { ...loaded, loginAccess: 'shift' }, admin);
      expect((await listStaff()).find((item) => item.id === staff.id)?.loginAccess).toBe('shift');
    });
    it('keeps a full-day shift after midnight and resets an earlier extension on reassignment', async () => {
      const admin = contextFor('facility_admin');
      await assignShift({ staffId: 'staff:nurse', day: '2026-10-24', startsAt: '2026-10-24T08:00:00Z', endsAt: '2026-10-24T16:00:00Z' }, admin);
      let shifts = await listShifts();
      const id = shifts[0].id;
      await extendShift(shifts[0], '2026-10-24T20:00:00Z', admin);
      await assignShift({ id, staffId: 'staff:nurse', day: '2026-10-24', startsAt: '2026-10-24T08:00:00Z', endsAt: '2026-10-25T08:00:00Z' }, admin);
      shifts = await listShifts();
      expect(shifts).toHaveLength(1);
      expect(shifts[0]).toMatchObject({ id, endsAt: '2026-10-25T08:00:00Z', extendedUntil: '2026-10-25T08:00:00Z' });
      expect(findShift(shifts, 'staff:nurse', Date.parse('2026-10-25T07:00:00Z'))?.id).toBe(id);
      await expect(assignShift({ id, staffId: 'staff:other', day: '2026-10-24', startsAt: shifts[0].startsAt, endsAt: shifts[0].endsAt }, admin)).rejects.toThrow(/no longer available/);
    });
  });

  describe('staff edits and combined access', () => {
    it('keeps staff identity while editing names, roles and individual grants', async () => {
      const admin = contextFor('facility_admin');
      const staff = await createStaff({ fullName: 'Test Nurse', role: 'nurse', permission: 'read_write', additionalRoles: ['cashier'], additionalPermissions: ['fee_item:manage'] }, admin);
      await editStaff(staff, { ...staff, fullName: 'Updated Nurse', additionalRoles: ['cashier', 'supervisor'] }, admin);
      const saved = (await listStaff())[0];
      expect(saved).toMatchObject({ id: staff.id, staffId: staff.staffId, fullName: 'Updated Nurse', role: 'nurse', additionalRoles: ['cashier', 'supervisor'], additionalPermissions: ['fee_item:manage'], updatedBy: admin.userId });
      const context = authorizationFor({ staff: saved, facilityId: admin.facilityId, deviceId: admin.deviceId });
      expect(context.permissions).toEqual(expect.arrayContaining(['encounter:record', 'payment:receive', 'fee_item:manage', 'roster:extend']));
      await expect(createFeeItem({ name: 'Combined-role fee', category: 'consultation', amountMinor: 10000, currency: 'NGN', chargeWhen: 'every_visit', exemptions: [] }, context)).resolves.toHaveProperty('name', 'Combined-role fee');
    });
    it('checks all required permissions before applying any part of an edit', async () => {
      const staff = await createStaff({ fullName: 'Original Name', role: 'nurse', permission: 'read_write' }, contextFor('facility_admin'));
      const manager = authorizationFor({ staff: { ...staff, additionalPermissions: ['staff:manage'] }, facilityId: 'OOE-PHC', deviceId: 'device-1' });
      await expect(editStaff(staff, { ...staff, fullName: 'Must not partially save', additionalRoles: ['facility_admin'] }, manager)).rejects.toThrow(/role doesn't allow/);
      expect((await listStaff())[0].fullName).toBe('Original Name');
      await editStaff(staff, { ...staff, fullName: 'Renamed by delegate' }, manager);
      expect((await listStaff())[0].fullName).toBe('Renamed by delegate');
      await expect(createStaff({ fullName: 'Escalated account', role: 'facility_admin', permission: 'read_write' }, manager)).rejects.toThrow(/role doesn't allow/);
      expect(await listStaff()).toHaveLength(1);
    });
    it('blocks every mutation for read-only staff even with combined grants', async () => {
      const staff = await createStaff({ fullName: 'View Only', role: 'nurse', additionalRoles: ['cashier'], additionalPermissions: ['fee_item:manage'], permission: 'read_only' }, contextFor('facility_admin'));
      const context = authorizationFor({ staff, facilityId: 'OOE-PHC', deviceId: 'device-1' });
      expect(context.permissions).toEqual([]);
      await expect(editStaff(staff, { ...staff, permission: 'read_write' }, context)).rejects.toThrow(/role doesn't allow/);
      expect((await listStaff())[0].permission).toBe('read_only');
    });
    it('retains a working admin, including an admin assigned as an additional role', async () => {
      const admin = contextFor('facility_admin');
      const secondary = await createStaff({ fullName: 'Secondary Admin', role: 'nurse', additionalRoles: ['facility_admin'], permission: 'read_write' }, admin);
      await expect(editStaff(secondary, { ...secondary, additionalRoles: [] }, admin)).rejects.toThrow(/at least one active facility administrator/);
      expect((await listStaff())[0].additionalRoles).toEqual(['facility_admin']);
      await createStaff({ fullName: 'Backup Admin', role: 'facility_admin', permission: 'read_write' }, admin);
      await editStaff(secondary, { ...secondary, additionalRoles: [] }, admin);
      expect((await listStaff()).find((item) => item.id === secondary.id)?.additionalRoles).toEqual([]);
    });
  });

  it('saves and reads back an encounter step, whose `values` column is an SQL keyword', async () => {
    const patient = await registerPatient({ fullName: 'Amaka Okoro', address: 'Odo-Ona', sex: 'female', ageYears: 32 }, contextFor('records_officer'));

    const vitals = await saveStep({ patientId: patient.patientId, step: 'vitals', values: { temperatureC: 38.9 } }, contextFor('nurse'));
    await amendEntry(vitals, 'Temperature was 37.9', contextFor('nurse'));

    const entries = await entriesForEncounter(vitals.encounterId);
    expect(entries.map((entry) => entry.step).sort()).toEqual(['amendment', 'vitals']);
    expect(entries.find((entry) => entry.step === 'vitals')?.values).toEqual({ temperatureC: 38.9 });
  });

  it('updates a record column by column', async () => {
    const patient = await registerPatient({ fullName: 'Bisi Adeyemi', address: 'Ring Road', sex: 'female', ageYears: 41 }, contextFor('records_officer'));

    const updated = await updatePatient(
      patient.patientId,
      { fullName: 'Bisi Adeyemi', address: 'Mokola', sex: 'female', ageYears: 41 },
      contextFor('records_officer'),
    );

    expect(updated.address).toBe('Mokola');
  });

  it('clears optional fields through real SQLite and preserves the original age anchor on unrelated edits', async () => {
    const context = contextFor('records_officer');
    const patient = await registerPatient({ fullName: 'Test Patient', address: 'Test address', sex: 'female', ageYears: 30, ageObservedOn: '2020-06-01', phone: '08035550147', nin: '12345678901' }, context);
    const form = fromPatient(patient);
    const updated = await updatePatient(patient.id, toPatientDetails({ ...form, phone: '', nin: '', address: 'New address' }), context);
    expect(updated.ageYears).toBe(30); expect(updated.ageObservedOn).toBe('2020-06-01');
    expect(updated.phone).toBeUndefined(); expect(updated.nin).toBeUndefined();
    expect((await getPatient(patient.id))?.phone).toBeUndefined();
  });

  it('persists registration review decisions with the patient and resolves aliases only after server confirmation', async () => {
    const context = contextFor('records_officer');
    const first = await registerPatient({ fullName: 'Test Patient', address: 'Test', sex: 'female', ageYears: 30 }, context);
    const second = await registerPatient({ fullName: 'Test Patient', address: 'Test', sex: 'female', ageYears: 30 }, context, (id) => identityReviewRecords(id, { candidateIds: [first.id], outcome: 'review_requested', reason: 'Identity uncertain at registration' }, context));
    expect((await listIdentityEvents())[0].otherPatientId).toBe(first.id);
    expect(await patientIdentityIds(second.id)).toEqual([second.id]);
    // A downloaded server event, inserted directly to stand in for sync, not a local mutation.
    await db.execute('INSERT INTO patient_identity_events (id, facilityId, schemaVersion, createdBy, createdOn, deviceId, patientId, otherPatientId, outcome, reason, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ['server-link', context.facilityId, 3, context.userId, new Date().toISOString(), context.deviceId, first.id, second.id, 'linked', 'Confirmed by records officer', 1]);
    expect((await patientIdentityIds(second.id)).sort()).toEqual([first.id, second.id].sort());
  });

  it('recognises linked registration fees at booking and keeps collect-later attribution on the original appointment', async () => {
    const context = contextFor('records_officer');
    const primary = await registerPatient({ fullName: 'Linked Patient', address: 'Test', sex: 'female', ageYears: 30 }, context);
    const alias = await registerPatient({ fullName: 'Linked Patient', address: 'Test', sex: 'female', ageYears: 30 }, context);
    const fee = await createFeeItem({ name: 'Registration', category: 'registration', amountMinor: 100000, currency: 'NGN', chargeWhen: 'first_visit', exemptions: [] }, contextFor('facility_admin'));
    const charge = await createCharge(fee.id, { patientId: primary.id, facts: { sex: 'female', ageYears: 30 } }, context);
    await db.execute('INSERT INTO patient_identity_events (id, facilityId, schemaVersion, createdBy, createdOn, deviceId, patientId, otherPatientId, outcome, reason, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', ['server-link', context.facilityId, 3, context.userId, new Date().toISOString(), context.deviceId, primary.id, alias.id, 'linked', 'Confirmed same person', 1]);
    const appointment = await book({ patientId: alias.id, reason: 'Review' }, context);
    expect(await chargesForPatient(alias.id)).toEqual([]);
    expect(appointment.chargeIds).toEqual([charge.id]);
    await expect(saveStep({ patientId: alias.id, appointmentId: appointment.id, step: 'vitals', values: { temperatureC: 37 } }, contextFor('nurse'))).rejects.toThrow(/collect later/);
    const entry = await saveStep({ patientId: alias.id, appointmentId: appointment.id, step: 'vitals', values: { temperatureC: 37 }, collectLaterReason: 'Urgent care authorised' }, contextFor('nurse'));
    expect(entry.patientId).toBe(alias.id);
    expect((await getPatient(primary.id))?.patientId).toBe(primary.id);
  });

  it('saves a register entry, which also keeps its answers in `values`', async () => {
    const context = contextFor('nurse');
    await expect(
      insertRecord(context, 'register_entry:create', 'register_entry', {
        ...envelope(context),
        id: newId('register_entry'),
        type: 'register_entry',
        registerId: 'register:opd',
        registerVersion: 1,
        entryDate: '2026-10-03',
        values: { diagnosis: 'Malaria' },
      }),
    ).resolves.toMatchObject({ values: { diagnosis: 'Malaria' } });
  });

  it('keeps the appointment linked when saving vitals opens its encounter', async () => {
    const patient = await registerPatient({ fullName: 'Amaka', address: 'Ring Road', sex: 'female', ageYears: 32 }, contextFor('records_officer'));
    const booking = await book({ patientId: patient.patientId, reason: 'Consultation' }, contextFor('records_officer'));
    const entry = await saveStep({ patientId: patient.patientId, appointmentId: booking.id, step: 'vitals', values: { temperatureC: 37 } }, contextFor('nurse'));
    const row = await db.getOptional<{ appointmentId: string }>('SELECT appointmentId FROM encounters WHERE id = ?', [entry.encounterId]);
    expect(row?.appointmentId).toBe(booking.id);
  });

  it('keeps the same booking, fees and attributed history through rescheduling, cancellation and reopening', async () => {
    const context = contextFor('records_officer');
    const patient = await registerPatient({ fullName: 'Booked Patient', address: 'Test road', sex: 'female', ageYears: 35 }, context);
    const fee = await createFeeItem({ name: 'Consultation', category: 'consultation', amountMinor: 100000, currency: 'NGN', chargeWhen: 'every_visit', exemptions: [] }, contextFor('facility_admin'));
    const booking = await book({ patientId: patient.id, reason: 'Review' }, context);
    const chargesBefore = await chargesForPatient(patient.id);
    expect(chargesBefore.some((charge) => charge.feeItemId === fee.id)).toBe(true);
    const moved = await changeAppointment(booking.id, { action: 'rescheduled', scheduledFor: new Date(Date.now() + 86_400_000).toISOString(), reason: 'Patient requested tomorrow' }, context);
    const cancelled = await changeAppointment(booking.id, { action: 'cancelled', reason: 'Unable to attend', expectedActivityId: moved.activity?.[0].id }, context);
    await expect(saveStep({ patientId: patient.id, appointmentId: booking.id, step: 'vitals', values: { temperatureC: 37 } }, contextFor('nurse'))).rejects.toThrow(/Reopen/);
    await expect(changeAppointment(booking.id, { action: 'reopened', reason: 'Can attend' }, context)).rejects.toThrow(/changed/);
    const reopened = await changeAppointment(booking.id, { action: 'reopened', reason: 'Patient can attend', expectedActivityId: cancelled.activity?.[1].id }, context);
    expect((await listAppointments()).map((appointment) => appointment.id)).toEqual([booking.id]);
    expect(reopened.activity?.map((event) => event.action)).toEqual(['rescheduled', 'cancelled', 'reopened']);
    expect(reopened.activity?.every((event) => event.recordedBy === context.userId)).toBe(true);
    expect(reopened.updatedOn).toBe(reopened.activity?.[2].recordedOn);
    expect(await chargesForPatient(patient.id)).toEqual(chargesBefore);
  });

  it('guards no-shows, readonly changes and duplicate or inactive linked visits before writing', async () => {
    const context = contextFor('records_officer');
    const patient = await registerPatient({ fullName: 'Arrival Patient', address: 'Test road', sex: 'female', ageYears: 25 }, context);
    const booking = await book({ patientId: patient.id, reason: 'Consultation' }, context);
    const readonly = { ...context, permissions: [] };
    await expect(changeAppointment(booking.id, { action: 'arrived' }, readonly)).rejects.toThrow();
    const arrival = await changeAppointment(booking.id, { action: 'arrived' }, context);
    await expect(changeAppointment(booking.id, { action: 'no_show', reason: 'Missed visit', expectedActivityId: arrival.activity?.[0].id }, context)).rejects.toThrow(/due booking/);
    const saved = await saveStep({ patientId: patient.id, appointmentId: booking.id, step: 'vitals', values: { temperatureC: 37 } }, contextFor('nurse'));
    expect(saved.encounterId).toBeTruthy();
    await expect(changeAppointment(booking.id, { action: 'cancelled', reason: 'Changed mind', expectedActivityId: arrival.activity?.[0].id }, context)).rejects.toThrow(/Care has already started/);
    await expect(saveStep({ patientId: patient.id, appointmentId: booking.id, step: 'vitals', values: { temperatureC: 37 } }, contextFor('nurse'))).rejects.toThrow(/already has a visit/);
  });

  it('keeps immediate booking actions attributable when the device clock has not advanced', async () => {
    const context = contextFor('records_officer');
    const patient = await registerPatient({ fullName: 'Immediate Actions', address: 'Test road', sex: 'female', ageYears: 25 }, context);
    const booking = await book({ patientId: patient.id, reason: 'Consultation' }, context);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(booking.createdOn));
    try {
      const arrival = await changeAppointment(booking.id, { action: 'arrived' }, context);
      const cancelled = await changeAppointment(booking.id, { action: 'cancelled', reason: 'Left before care', expectedActivityId: arrival.activity?.[0].id }, context);
      expect(Date.parse(cancelled.updatedOn!)).toBeGreaterThan(Date.parse(arrival.updatedOn!));
      expect(cancelled.updatedOn).toBe(cancelled.activity?.[1].recordedOn);
      expect((await listAppointments())[0].activity).toHaveLength(2);
    } finally { clock.mockRestore(); }
  });

  it('resumes immutable register drafts without changing the published form or historic entries', async () => {
    const context = contextFor('records_officer');
    const values = { name: 'Daily record', category: 'General', description: '', fields: [] };
    const initial = await saveDraftDefinition(values, null, context, 0);
    const published = await publishDefinition({ ...values, fields: [{ id: 'name', type: 'text', label: 'Patient name', required: true }] }, initial.registerId, context, 1);
    await saveDraftDefinition({ ...values, name: 'Work in progress' }, initial.registerId, context, 2);
    expect((await addEntry({ registerId: initial.registerId, values: { name: 'Example patient' } }, context)).saved).toBe(true);
    expect((await listEntries())[0]).toMatchObject({ registerVersion: published.version, values: { name: 'Example patient' } });
    expect((await listDefinitions()).map((definition) => definition.status)).toEqual(['draft', 'published', 'draft']);
    await expect(saveDraftDefinition(values, initial.registerId, context, 2)).rejects.toThrow(/newer register version/);
    const republished = await publishDefinition({ ...values, fields: published.fields }, initial.registerId, context, 3);
    expect(republished.version).toBe(4);
    expect((await listEntries())[0].registerVersion).toBe(2);
  });

  it('recovers incomplete register typing privately, validates writes and never queues it for sync', async () => {
    const context = contextFor('records_officer'), other = contextFor('facility_admin');
    const incomplete = { name: '', category: 'General', description: 'Half-written instructions', fields: [{ id: 'field:one', type: 'text' as const, label: '', required: false }] };
    await writeRegisterRecovery(context, 'new', incomplete, 0);
    await writeRegisterRecovery(context, 'new', { ...incomplete, name: 'Work in progress' }, 0);
    expect((await readRegisterRecovery(context, 'new'))?.name).toBe('Work in progress');
    expect(await readRegisterRecovery(other, 'new')).toBeUndefined();
    expect(await listDefinitions()).toEqual([]);
    expect(TABLE_FOR).not.toHaveProperty('register_builder_drafts');
    await expect(writeRegisterRecovery({ ...context, permissions: [] }, 'new', incomplete, 0)).rejects.toThrow();
    await discardRegisterRecovery(context, 'new');
    expect(await readRegisterRecovery(context, 'new')).toBeUndefined();
  });

  describe('offline billing', () => {
    const patientId = 'OOE-PHC-000047-K2';
    const otherPatientId = 'OOE-PHC-000048-AB';
    const draft = (extra: Partial<FeeDraft> = {}): FeeDraft => ({
      name: 'Consultation', category: 'consultation', amountMinor: 150000, currency: 'NGN',
      chargeWhen: 'every_visit', exemptions: [{ reason: 'Under-5 policy', ageUnderYears: 5 }],
      ...extra,
    });
    const charge = async (extra: Partial<FeeDraft> = {}, patient = patientId) => {
      const fee = await createFeeItem({ ...draft(), ...extra }, contextFor('facility_admin'));
      return createCharge(fee.id, { patientId: patient, facts: { ageYears: 32, sex: 'female' }, appointmentId: 'appointment:1' }, contextFor('records_officer'));
    };

    it('round-trips fee rules, amounts and retirement through SQLite', async () => {
      const fee = await createFeeItem(draft(), contextFor('facility_admin'));
      expect((await listFeeItems())[0]).toMatchObject({ amountMinor: 150000, active: true, exemptions: draft().exemptions });
      await setFeeItemActive(fee.id, false, contextFor('facility_admin'));
      expect((await listFeeItems())[0].active).toBe(false);
      await expect(createCharge(fee.id, { patientId, facts: { sex: 'female' } }, contextFor('nurse'))).rejects.toThrow(/retired/);
      expect(await chargesForPatient(patientId)).toEqual([]);
      await setFeeItemActive(fee.id, true, contextFor('facility_admin'));
      expect((await listFeeItems())[0].active).toBe(true);
    });

    it('keeps the old bill at its original price after editing a fee', async () => {
      const first = await charge();
      await updateFeeItem(first.feeItemId, { ...draft(), name: 'New consultation', amountMinor: 200000 }, contextFor('facility_admin'));
      const second = await createCharge(first.feeItemId, { patientId, facts: { sex: 'female' } }, contextFor('nurse'));
      expect((await chargesForPatient(patientId)).find((bill) => bill.id === first.id)).toMatchObject({ description: 'Consultation', amountMinor: 150000 });
      expect(second).toMatchObject({ description: 'New consultation', amountMinor: 200000 });
    });

    it('records an exemption at zero, but never assumes an unknown age qualifies', async () => {
      const fee = await createFeeItem(draft(), contextFor('facility_admin'));
      const exempt = await createCharge(fee.id, { patientId, facts: { ageYears: 4, sex: 'female' } }, contextFor('nurse'));
      const unknownAge = await createCharge(fee.id, { patientId, facts: { sex: 'female' } }, contextFor('nurse'));
      expect(exempt).toMatchObject({ listPriceMinor: 150000, amountMinor: 0, exemptionReason: 'Under-5 policy' });
      expect(unknownAge).toMatchObject({ amountMinor: 150000, exemptionReason: undefined });
    });

    it('enforces the cashier and admin permissions before storing money or fees', async () => {
      await expect(createFeeItem(draft(), contextFor('cashier'))).rejects.toThrow(/role/);
      expect(await listFeeItems()).toEqual([]);
      const bill = await charge();
      await expect(recordPayment({ patientId, method: 'cash', currency: 'NGN', allocations: [{ chargeId: bill.id, amountMinor: 10000 }] }, contextFor('nurse'))).rejects.toThrow(/role/);
      await expect(recordPayment({ patientId, method: 'waiver', currency: 'NGN', allocations: [{ chargeId: bill.id, amountMinor: 10000 }], reason: 'Indigent' }, contextFor('cashier'))).rejects.toThrow(/role/);
      expect(await paymentsForPatient(patientId)).toEqual([]);
    });

    it('confirms only after every appointment charge is settled, including part payments', async () => {
      const bill = await charge();
      const card = await charge({ name: 'Card', category: 'card', amountMinor: 50000 });
      expect(isAppointmentConfirmed('appointment:1', [], [])).toBe(true);
      const part = await recordPayment({ patientId, method: 'cash', currency: 'NGN', allocations: [{ chargeId: bill.id, amountMinor: 100000 }] }, contextFor('cashier'));
      expect(isAppointmentConfirmed('appointment:1', [bill, card], [part])).toBe(false);
      await recordPayment({ patientId, method: 'pos', currency: 'NGN', allocations: [{ chargeId: bill.id, amountMinor: 50000 }, { chargeId: card.id, amountMinor: 50000 }] }, contextFor('cashier'));
      expect(isAppointmentConfirmed('appointment:1', await chargesForPatient(patientId), await paymentsForPatient(patientId))).toBe(true);
      expect((await paymentsForPatient(patientId)).map((payment) => payment.receiptNumber)).toEqual([
        expect.stringMatching(/^OOE-PHC-R-000001-/), expect.stringMatching(/^OOE-PHC-R-000002-/),
      ]);
    });

    it('preserves an overpayment as credit and keeps currencies separate', async () => {
      const bill = await charge();
      const usd = await charge({ currency: 'USD', amountMinor: 2500 });
      for (let i = 0; i < 2; i += 1) {
        await recordPayment({ patientId, method: 'cash', currency: 'NGN', allocations: [{ chargeId: bill.id, amountMinor: 150000 }] }, contextFor('cashier'));
      }
      const payments = await paymentsForPatient(patientId);
      expect(chargeBalances([bill], payments)[0].balanceMinor).toBe(-150000);
      expect(balancesByCurrency([bill, usd], payments)).toEqual(new Map([['NGN', -150000], ['USD', 2500]]));
      expect(isAppointmentConfirmed('appointment:1', [bill, usd], payments)).toBe(false);
    });

    it('refuses allocations to another patient, a missing charge or another currency', async () => {
      const bill = await charge();
      const other = await charge({}, otherPatientId);
      for (const bad of [
        { chargeId: other.id, currency: 'NGN' },
        { chargeId: 'charge:missing', currency: 'NGN' },
        { chargeId: bill.id, currency: 'USD' },
      ]) {
        await expect(recordPayment({ patientId, method: 'cash', currency: bad.currency, allocations: [{ chargeId: bad.chargeId, amountMinor: 10000 }] }, contextFor('cashier'))).rejects.toThrow();
      }
      expect(await paymentsForPatient(patientId)).toEqual([]);
    });

    it('rejects duplicate allocations and a waiver without a reason before inserting', async () => {
      const bill = await charge();
      const allocation = { chargeId: bill.id, amountMinor: 10000 };
      await expect(recordPayment({ patientId, method: 'cash', currency: 'NGN', allocations: [allocation, allocation] }, contextFor('cashier'))).rejects.toThrow(/Allocate to each charge once/);
      await expect(recordPayment({ patientId, method: 'waiver', currency: 'NGN', allocations: [allocation] }, contextFor('supervisor'))).rejects.toThrow(/reason/);
      expect(await paymentsForPatient(patientId)).toEqual([]);
    });

    it('settles a fee by waiver, with the supervisor and reason kept', async () => {
      const bill = await charge();
      const waiver = await recordPayment({ patientId, method: 'waiver', currency: 'NGN', allocations: [{ chargeId: bill.id, amountMinor: 150000 }], reason: 'Indigent patient' }, contextFor('supervisor'));
      expect(waiver).toMatchObject({ method: 'waiver', reason: 'Indigent patient', createdBy: 'staff:supervisor' });
      expect(isAppointmentConfirmed('appointment:1', [bill], [waiver])).toBe(true);
    });

    it('reverses by adding an exact copy of the allocations and restores the debt', async () => {
      const bill = await charge();
      const original = await recordPayment({ patientId, method: 'transfer', currency: 'NGN', reference: 'BANK-1', allocations: [{ chargeId: bill.id, amountMinor: 150000 }] }, contextFor('cashier'));
      await expect(reversePayment(original.id, 'Wrong patient', contextFor('cashier'))).rejects.toThrow(/role/);
      await expect(reversePayment(original.id, ' ', contextFor('supervisor'))).rejects.toThrow(/reason/);
      const reversal = await reversePayment(original.id, 'Payment returned', contextFor('supervisor'));
      expect(reversal).toMatchObject({ reverses: original.id, allocations: original.allocations, amountMinor: original.amountMinor, reference: 'BANK-1', method: 'transfer' });
      const payments = await paymentsForPatient(patientId);
      expect(payments.find((payment) => payment.id === original.id)).toEqual(original);
      expect(chargeBalances([bill], payments)[0].balanceMinor).toBe(150000);
      await expect(reversePayment(original.id, 'Again', contextFor('supervisor'))).rejects.toThrow(/already been reversed/);
      await expect(reversePayment(reversal.id, 'Undo', contextFor('supervisor'))).rejects.toThrow(/cannot itself/);
      expect(await paymentsForPatient(patientId)).toHaveLength(2);
    });

    it('rejects amounts PostgreSQL cannot store before creating a local fee', async () => {
      await expect(createFeeItem({ ...draft(), amountMinor: 2147483648 }, contextFor('facility_admin'))).rejects.toThrow(/supported range/);
      expect(await listFeeItems()).toEqual([]);
    });

    it('keeps discounts and waivers beside the original charge and settles only the reduced debt', async () => {
      const bill = await charge();
      await expect(adjustCharge(bill.id, 'discount', 20000, 'Not authorised', contextFor('cashier'))).rejects.toThrow(/role/);
      await adjustCharge(bill.id, 'discount', 20000, 'Staff concession', contextFor('supervisor'));
      await recordPayment({ patientId, method: 'cash', currency: 'NGN', allocations: [{ chargeId: bill.id, amountMinor: 100000 }] }, contextFor('cashier'));
      await adjustCharge(bill.id, 'waiver', 30000, 'Approved remaining balance', contextFor('supervisor'));
      const payments = await paymentsForPatient(patientId); const adjustments = await adjustmentsForPatient(patientId);
      expect(chargeBalances([bill], payments, adjustments)[0]).toMatchObject({ discountMinor: 20000, waivedMinor: 30000, dueMinor: 100000, balanceMinor: 0 });
      expect((await chargesForPatient(patientId)).find((c) => c.id === bill.id)?.amountMinor).toBe(150000);
      await expect(adjustCharge(bill.id, 'discount', 1, 'Too much', contextFor('supervisor'))).rejects.toThrow(/unpaid balance/);
      expect(adjustments.map((a) => a.createdBy)).toEqual(['staff:supervisor', 'staff:supervisor']);
    });

    it('raises first-visit fees at registration once, then consultation fees for each booking', async () => {
      await createFeeItem(draft({ name: 'Registration', category: 'registration', chargeWhen: 'first_visit', amountMinor: 50000, exemptions: [] }), contextFor('facility_admin'));
      await createFeeItem(draft({ name: 'Consultation', chargeWhen: 'every_visit', amountMinor: 100000, exemptions: [] }), contextFor('facility_admin'));
      const patient = await registerPatient({ fullName: 'New Patient', address: 'Test road', sex: 'female', ageYears: 30 }, contextFor('records_officer'));
      const initial = await chargesForPatient(patient.patientId); expect(initial).toHaveLength(1);
      const first = await book({ patientId: patient.patientId, reason: 'Consultation', visitType: 'general' }, contextFor('records_officer'));
      const second = await book({ patientId: patient.patientId, reason: 'Review', visitType: 'follow_up' }, contextFor('records_officer'));
      const charges = await chargesForPatient(patient.patientId);
      expect(charges.filter((c) => c.category === 'registration')).toHaveLength(1);
      expect(charges.filter((c) => c.category === 'consultation')).toHaveLength(2);
      expect(first.chargeIds).toContain(initial[0].id);
      expect(second.chargeIds).not.toContain(initial[0].id);
      expect(isAppointmentConfirmed(first.id, charges, [], [], first.chargeIds)).toBe(false);
    });

    it('rolls back a whole multi-record save when SQLite rejects a later insert', async () => {
      const { insertRecords } = await import('./db');
      const fee = await createFeeItem(draft(), contextFor('facility_admin'));
      const bill = { ...envelope(contextFor('records_officer')), id: 'charge:duplicate', type: 'charge', patientId, feeItemId: fee.id, category: 'consultation', description: 'Consultation', listPriceMinor: 10000, amountMinor: 10000, currency: 'NGN' };
      await expect(insertRecords(contextFor('records_officer'), [{ type: 'charge', permission: 'charge:create', record: bill }, { type: 'charge', permission: 'charge:create', record: bill }])).rejects.toThrow();
      expect(await chargesForPatient(patientId)).toEqual([]);
    });

    it('waits for visit type before assessing a first-visit fee with programme exemptions', async () => {
      await createFeeItem(draft({ name: 'Registration', category: 'registration', chargeWhen: 'first_visit', exemptions: [{ reason: 'Antenatal programme', visitTypes: ['antenatal'] }] }), contextFor('facility_admin'));
      const patient = await registerPatient({ fullName: 'ANC Patient', address: 'Test road', sex: 'female', ageYears: 30 }, contextFor('records_officer'));
      expect(await chargesForPatient(patient.patientId)).toEqual([]);
      const appointment = await book({ patientId: patient.patientId, reason: 'ANC', visitType: 'antenatal' }, contextFor('records_officer'));
      const bills = await chargesForPatient(patient.patientId);
      expect(bills).toHaveLength(1);
      expect(bills[0]).toMatchObject({ amountMinor: 0, listPriceMinor: 150000, exemptionReason: 'Antenatal programme' });
      expect(isAppointmentConfirmed(appointment.id, bills, [], [], appointment.chargeIds)).toBe(true);
    });
  });

  describe('longitudinal care', () => {
    const patientId = 'OOE-PHC-000047-K2';
    const values = { label: 'Hypertension', status: 'active', certainty: 'confirmed' };
    it('saves and resolves a problem as an attributed append-only chain', async () => {
      const original = await saveClinicalRecord(patientId, 'problem', values, contextFor('doctor'));
      const revision = await saveClinicalRecord(patientId, 'problem', { ...values, status: 'resolved' }, contextFor('doctor'), original);
      const record = await patientClinicalRecord(patientId);
      expect(record.events).toHaveLength(2);
      expect(record.current).toEqual([revision]);
      expect((await clinicalEventsForPatient(patientId))[0].values.status).toBe('active');
      await expect(saveClinicalRecord(patientId, 'problem', values, contextFor('doctor'), original)).rejects.toThrow(/changed/);
    });
    it('refuses unauthorized, malformed and cross-patient clinical writes', async () => {
      await expect(saveClinicalRecord(patientId, 'problem', values, contextFor('cashier'))).rejects.toThrow();
      await expect(saveClinicalRecord(patientId, 'allergy', values, contextFor('doctor'))).rejects.toThrow();
      const original = await saveClinicalRecord(patientId, 'problem', values, contextFor('doctor'));
      await expect(saveClinicalRecord('OOE-PHC-000048-K2', 'problem', values, contextFor('doctor'), original)).rejects.toThrow(/original patient/);
      expect(await clinicalEventsForPatient(patientId)).toHaveLength(1);
    });
    it('links a care plan to this patient’s problem and retains review outcomes', async () => {
      const problem = await saveClinicalRecord(patientId, 'problem', values, contextFor('doctor'));
      const plan = await saveClinicalRecord(patientId, 'care_plan', { title: 'Review', goal: 'Assess progress', actions: 'Review observations', status: 'active', problemId: problem.recordId }, contextFor('doctor'));
      const reviewed = await saveClinicalRecord(patientId, 'care_plan', { ...plan.values, outcome: 'Reviewed', status: 'completed' }, contextFor('doctor'), plan);
      expect(reviewed.previousId).toBe(plan.id);
      await expect(saveClinicalRecord(patientId, 'care_plan', { ...plan.values, problemId: 'other-patient-problem' }, contextFor('doctor'))).rejects.toThrow(/belonging/);
    });
    it('records repeated vitals and structured corrections without rewriting saved entries', async () => {
      const original = await saveStep({ patientId, step: 'vitals', values: { temperatureC: 39 } }, contextFor('nurse'));
      const repeat = await saveStep({ patientId, encounterId: original.encounterId, step: 'vitals', values: { temperatureC: 38 } }, contextFor('nurse'));
      const correction = await amendEntry(original, 'Transcription correction', contextFor('nurse'), { temperatureC: 37 }, null);
      expect(await entriesForEncounter(original.encounterId)).toHaveLength(3);
      expect(correction.values.correctedValues).toEqual({ temperatureC: 37 });
      await expect(amendEntry(original, 'Stale correction', contextFor('nurse'), { temperatureC: 36 }, null)).rejects.toThrow(/corrected while/);
      await saveStep({ patientId, encounterId: original.encounterId, step: 'follow_up', values: {} }, contextFor('doctor'));
      await expect(saveStep({ patientId, encounterId: repeat.encounterId, step: 'vitals', values: { temperatureC: 36 } }, contextFor('nurse'))).rejects.toThrow(/closed/);
    });
    it('protects dispositions and the current dispensed prescription before an offline correction is written', async () => {
      const original = await saveStep({ patientId, step: 'diagnosis', values: { diagnosis: 'Initial', prescription: [{ drug: 'Original medicine', dose: '1 tablet' }] } }, contextFor('doctor'));
      const correctedPrescription = { diagnosis: 'Reviewed', prescription: [{ drug: 'Reviewed medicine', dose: '1 tablet' }] };
      const revision = await amendEntry(original, 'Reviewed before dispensing', contextFor('doctor'), correctedPrescription, null);
      await saveStep({ patientId, encounterId: original.encounterId, step: 'dispense', values: { lines: [{ drug: 'Reviewed medicine', dispensed: true }] } }, contextFor('nurse'));
      await expect(amendEntry(original, 'Change disposition', contextFor('doctor'), { ...correctedPrescription, admit: true }, revision.id)).rejects.toThrow(/disposition/);
      await expect(amendEntry(original, 'Change prescription', contextFor('doctor'), { diagnosis: 'Reviewed', prescription: [] }, revision.id)).rejects.toThrow(/dispensed/);
      const textCorrection = await amendEntry(original, 'Clarify diagnosis only', contextFor('doctor'), { ...correctedPrescription, diagnosis: 'Clarified diagnosis' }, revision.id);
      expect(textCorrection.values.previousAmendmentId).toBe(revision.id);
      expect(await entriesForEncounter(original.encounterId)).toHaveLength(4);
      await expect(saveStep({ patientId, encounterId: original.encounterId, step: 'diagnosis', values: { diagnosis: 'Second diagnosis' } }, contextFor('doctor'))).rejects.toThrow(/already saved/);
    });
  });

  describe('unsaved encounter work', () => {
    const nurse = { staffId: 'staff:nurse', patientId: 'OOE-PHC-000047-K2', encounterKey: 'new' };

    it('keeps a section as it is typed, replacing the earlier version', async () => {
      await writeDraft(nurse, 'vitals', { temp: '38', bp: '', pulse: '', weight: '', spo2: '' });
      await writeDraft(nurse, 'vitals', { temp: '38.9', bp: '120/80', pulse: '', weight: '', spo2: '' });

      const drafts = await readDrafts(nurse);
      expect(drafts).toHaveLength(1);
      expect(drafts[0]).toMatchObject({ step: 'vitals', data: { temp: '38.9', bp: '120/80' } });
    });

    /** On a shared phone the next person on shift must not see, or save under their name, a half-written note. */
    it('shows a draft only to the person who typed it', async () => {
      await writeDraft(nurse, 'complaint', { text: 'fever for 3 days', note: '' });

      expect(await readDrafts({ ...nurse, staffId: 'staff:doctor' })).toEqual([]);
      expect(await readDrafts({ ...nurse, encounterKey: 'encounter:other' })).toEqual([]);
    });

    it('throws a section away once saved, and everything once the encounter closes', async () => {
      await writeDraft(nurse, 'vitals', { temp: '38.9', bp: '', pulse: '', weight: '', spo2: '' });
      await writeDraft(nurse, 'complaint', { text: 'fever', note: '' });

      await discardDraft(nurse, 'vitals');
      expect((await readDrafts(nurse)).map((draft) => draft.step)).toEqual(['complaint']);

      await discardDrafts(nurse);
      expect(await readDrafts(nurse)).toEqual([]);
    });
  });
});
