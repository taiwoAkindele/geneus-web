import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthorizationContext, DocType, Staff } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { fieldKindsFor } from './contractShape';
import { insertRecord, envelope, newId } from './db';
import { recordServerContact } from './deviceCredential';
import { setDatabaseForTests, type LocalDatabase } from './database';
import { discardDraft, discardDrafts, readDrafts, writeDraft } from './repos/drafts';
import { amendEntry, entriesForEncounter, saveStep } from './repos/encounters';
import { registerPatient, updatePatient } from './repos/patients';
import {
  balancesByCurrency, chargeBalances, chargesForPatient, createCharge, createFeeItem,
  isAppointmentConfirmed, listFeeItems, paymentsForPatient, recordPayment, reversePayment,
  setFeeItemActive, updateFeeItem, type FeeDraft,
} from './repos/billing';
import { DRAFTS_TABLE, TABLE_FOR } from './tables';
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
  type Bindable = string | number | null;
  const bind = (parameters: unknown[]) => parameters.map((value) => (value === undefined ? null : value)) as Bindable[];
  return {
    ...fakeDatabase(),
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

  describe('offline billing', () => {
    const patientId = 'OOE-PHC-000047-K2';
    const otherPatientId = 'OOE-PHC-000048-AB';
    const draft = (): FeeDraft => ({
      name: 'Consultation', category: 'consultation', amountMinor: 150000, currency: 'NGN',
      chargeWhen: 'every_visit', exemptions: [{ reason: 'Under-5 policy', ageUnderYears: 5 }],
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
