import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrudEntry, CrudTransaction } from '@powersync/web';
import type { UploadMutation } from '@shared';
import { createConnector } from '../connector';
import { setDatabaseForTests, type LocalDatabase } from '../database';
import { clearDeviceCredential, saveDeviceCredential } from '../deviceCredential';
import { WORKFORCE_RECEIPTS_TABLE } from '../tables';
import { fakeDatabase } from '../testing/fakeDatabase';
import { confirmWorkforceReceipts, listWorkforceReceipts } from './workforceReceipts';

// Like PowerSync, expose records through a SQLite view with write triggers.
// A plain table would incorrectly allow the UPSERT that stalled uploads.
type Statement = { run: (...values: unknown[]) => unknown; all: (...values: unknown[]) => unknown[]; get: (...values: unknown[]) => unknown };
type NodeSqlite = { DatabaseSync: new (path: string) => { exec: (sql: string) => void; prepare: (sql: string) => Statement; close: () => void } };
const NODE_SQLITE = 'node:sqlite';
const { DatabaseSync } = (await import(/* @vite-ignore */ NODE_SQLITE)) as NodeSqlite;

const mutation = (clientId = 7): UploadMutation => ({ clientId, op: 'put', table: 'unit', id: 'unit:test', data: { revision: 1 } });
const reply = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const confirm = (applied: number[], rejected: number[] = []) => vi.stubGlobal('fetch', vi.fn(async () => reply({ applied, rejected })));

describe('workforce confirmations on a SQLite view', () => {
  let sqlite: InstanceType<NodeSqlite['DatabaseSync']>;
  let db: LocalDatabase;

  beforeEach(async () => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(`
      CREATE TABLE receipt_storage(id TEXT PRIMARY KEY, clientId INTEGER, outcome TEXT);
      CREATE VIEW ${WORKFORCE_RECEIPTS_TABLE} AS SELECT * FROM receipt_storage;
      CREATE TRIGGER receipt_insert INSTEAD OF INSERT ON ${WORKFORCE_RECEIPTS_TABLE}
        BEGIN INSERT INTO receipt_storage VALUES(NEW.id, NEW.clientId, NEW.outcome); END;
      CREATE TRIGGER receipt_update INSTEAD OF UPDATE ON ${WORKFORCE_RECEIPTS_TABLE}
        BEGIN UPDATE receipt_storage SET clientId=NEW.clientId, outcome=NEW.outcome WHERE id=OLD.id; END;
    `);
    const execute = async (sql: string, parameters: unknown[] = []) => sqlite.prepare(sql).run(...parameters);
    const getOptional = async <T,>(sql: string, parameters: unknown[] = []) => (sqlite.prepare(sql).get(...parameters) ?? null) as T | null;
    db = {
      ...fakeDatabase(),
      execute,
      getOptional,
      getAll: async <T,>(sql: string, parameters: unknown[] = []) => sqlite.prepare(sql).all(...parameters) as T[],
      writeTransaction: async (callback) => {
        sqlite.exec('BEGIN');
        try {
          const result = await callback({ execute, getOptional });
          sqlite.exec('COMMIT');
          return result;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      },
    };
    setDatabaseForTests(db);
    await saveDeviceCredential({ deviceId: 'device-test', facilityId: 'TEST', credential: 'synthetic-credential', syncEndpoint: 'http://sync' });
  });

  afterEach(() => {
    setDatabaseForTests(undefined);
    clearDeviceCredential();
    vi.unstubAllGlobals();
    sqlite.close();
  });

  it.each(['applied', 'rejected'] as const)('saves a server-confirmed %s outcome', async (outcome) => {
    confirm(outcome === 'applied' ? [7] : [], outcome === 'rejected' ? [7] : []);

    await confirmWorkforceReceipts('synthetic-credential', [mutation()]);

    expect(await listWorkforceReceipts()).toEqual([{ id: 'unit:test', clientId: 7, outcome }]);
  });

  it('handles a repeated confirmation without duplicating the receipt', async () => {
    confirm([7]);

    await confirmWorkforceReceipts('synthetic-credential', [mutation()]);
    await confirmWorkforceReceipts('synthetic-credential', [mutation()]);

    expect(await listWorkforceReceipts()).toEqual([{ id: 'unit:test', clientId: 7, outcome: 'applied' }]);
  });

  it('replaces an earlier outcome when a newer mutation is confirmed', async () => {
    confirm([], [7]);
    await confirmWorkforceReceipts('synthetic-credential', [mutation()]);
    confirm([8]);

    await confirmWorkforceReceipts('synthetic-credential', [mutation(8)]);

    expect(await listWorkforceReceipts()).toEqual([{ id: 'unit:test', clientId: 8, outcome: 'applied' }]);
  });

  it('keeps a newer outcome when an older confirmation arrives later', async () => {
    confirm([], [8]);
    await confirmWorkforceReceipts('synthetic-credential', [mutation(8)]);
    confirm([7]);

    await confirmWorkforceReceipts('synthetic-credential', [mutation()]);

    expect(await listWorkforceReceipts()).toEqual([{ id: 'unit:test', clientId: 8, outcome: 'rejected' }]);
  });

  it('makes no request when there are no confirmations to fetch', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await confirmWorkforceReceipts('synthetic-credential', []);

    expect(fetch).not.toHaveBeenCalled();
  });

  const queuedUpload = () => {
    const complete = vi.fn(async () => { queued = null; });
    const transaction = {
      transactionId: 3,
      crud: [{ clientId: 7, op: 'PUT', table: 'units', id: 'unit:test', opData: { revision: 1 } } as unknown as CrudEntry],
      complete,
    } as unknown as CrudTransaction;
    let queued: CrudTransaction | null = transaction;
    db.getNextCrudTransaction = async () => queued;
    return complete;
  };

  it('saves the confirmation and completes an acknowledged workforce upload', async () => {
    const complete = queuedUpload();
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/sync/receipts')) return reply({ applied: [7], rejected: [] });
      return reply({ applied: 1, duplicates: 0, rejected: [], serverTime: '2026-10-29T12:00:00Z' });
    }));

    await createConnector({ onDeenrolled: vi.fn() }).uploadData(db as never);

    expect(complete).toHaveBeenCalledOnce();
    expect(await db.getNextCrudTransaction()).toBeNull();
    expect(await listWorkforceReceipts()).toEqual([{ id: 'unit:test', clientId: 7, outcome: 'applied' }]);
  });

  it('retains the upload until a missing server confirmation is available on retry', async () => {
    const complete = queuedUpload();
    let receiptAvailable = false;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/sync/receipts')) return reply({ applied: receiptAvailable ? [7] : [], rejected: [] });
      return reply({ applied: 0, duplicates: 1, rejected: [], serverTime: '2026-10-29T12:00:00Z' });
    }));
    const connector = createConnector({ onDeenrolled: vi.fn() });

    await expect(connector.uploadData(db as never)).rejects.toThrow(/Waiting for the server/);
    expect(complete).not.toHaveBeenCalled();
    expect(await listWorkforceReceipts()).toEqual([]);
    expect(await db.getNextCrudTransaction()).not.toBeNull();

    receiptAvailable = true;
    await connector.uploadData(db as never);

    expect(complete).toHaveBeenCalledOnce();
    expect(await listWorkforceReceipts()).toEqual([{ id: 'unit:test', clientId: 7, outcome: 'applied' }]);
  });
});
