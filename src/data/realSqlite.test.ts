import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AuthorizationContext, DocType, Staff } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { fieldKindsFor } from './contractShape';
import { insertRecord, envelope, newId } from './db';
import { recordServerContact } from './deviceCredential';
import { setDatabaseForTests, type LocalDatabase } from './database';
import { amendEntry, entriesForEncounter, saveStep } from './repos/encounters';
import { registerPatient, updatePatient } from './repos/patients';
import { TABLE_FOR } from './tables';
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
});
