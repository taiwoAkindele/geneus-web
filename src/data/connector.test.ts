import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CrudEntry, CrudTransaction } from '@powersync/web';
import { createConnector, toMutation } from './connector';
import { clearDeviceCredential, lastServerContactOn, saveDeviceCredential } from './deviceCredential';
import { fakeDatabase } from './testing/fakeDatabase';

const credential = { deviceId: 'device-1', facilityId: 'OOE-PHC', credential: 'device-1.secret', syncEndpoint: 'http://sync' };

/** What PowerSync hands the connector for one queued write. */
const entry = (fields: Partial<CrudEntry> & Pick<CrudEntry, 'op' | 'table' | 'id'>): CrudEntry =>
  ({ clientId: 7, transactionId: 3, opData: {}, ...fields }) as unknown as CrudEntry;

const transactionOf = (crud: CrudEntry[]) => {
  const complete = vi.fn(async () => undefined);
  const transaction = { transactionId: 3, crud, complete } as unknown as CrudTransaction;
  return { transaction, complete };
};

const respond = (status: number, body: unknown) =>
  vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

/**
 * The two exchanges with geneus-server: minting a sync token and handing over
 * the queue. Both are checked for what they send (the contract's shapes) and
 * for what they do on the answers that matter — accepted, refused, revoked.
 */
describe('connector', () => {
  beforeEach(() => saveDeviceCredential(credential));
  afterEach(() => {
    clearDeviceCredential();
    vi.unstubAllGlobals();
  });

  describe('toMutation', () => {
    it('maps an insert to a put with contract values', () => {
      const mutation = toMutation(entry({ op: 'PUT' as CrudEntry['op'], table: 'patients', id: 'X-Y-000001-K2', opData: { fullName: 'Amaka', dobEstimated: 1, allergies: '["a"]' } }));

      expect(mutation).toEqual({ clientId: 7, op: 'put', table: 'patient', id: 'X-Y-000001-K2', data: { fullName: 'Amaka', dobEstimated: true, allergies: ['a'] } });
    });

    it('carries the previous values of a patch so the server can tell a real conflict', () => {
      const mutation = toMutation(entry({ op: 'PATCH' as CrudEntry['op'], table: 'patients', id: 'X-Y-000001-K2', opData: { phone: '0802' }, previousValues: { phone: '0801' } }));

      expect(mutation.op).toBe('patch');
      expect(mutation.previous).toEqual({ phone: '0801' });
    });

    it('restores the actor of a patch from the write metadata when updatedBy was unchanged and omitted', () => {
      const mutation = toMutation(entry({ op: 'PATCH' as CrudEntry['op'], table: 'roster_shifts', id: 'roster_shift:x', opData: { extendedUntil: '2026-09-12T20:00:00Z', updatedOn: '2026-09-12T18:00:00Z' }, metadata: 'staff:supervisor' }));

      expect(mutation.data.updatedBy).toBe('staff:supervisor');
    });

    it('keeps an explicit updatedBy over the metadata', () => {
      const mutation = toMutation(entry({ op: 'PATCH' as CrudEntry['op'], table: 'patients', id: 'X-Y-000001-K2', opData: { phone: '0802', updatedBy: 'staff:nurse' }, metadata: 'staff:other' }));

      expect(mutation.data.updatedBy).toBe('staff:nurse');
    });

    it('refuses a table the contract does not know', () => {
      expect(() => toMutation(entry({ op: 'PUT' as CrudEntry['op'], table: 'ps_secret', id: 'x' }))).toThrow(/unknown table/);
    });
  });

  describe('fetchCredentials', () => {
    it('mints a token as the device and records the server clock', async () => {
      const fetch = respond(200, { token: 'jwt', expiresOn: '2026-09-12T13:00:00Z', syncEndpoint: 'http://sync', serverTime: '2026-09-12T12:00:00Z' });
      vi.stubGlobal('fetch', fetch);

      const credentials = await createConnector({ onDeenrolled: vi.fn() }).fetchCredentials();

      expect(credentials).toEqual({ endpoint: 'http://sync', token: 'jwt', expiresAt: new Date('2026-09-12T13:00:00Z') });
      const init = fetch.mock.calls[0]?.[1] as RequestInit;
      expect(init).toMatchObject({ headers: expect.objectContaining({ authorization: 'Bearer device-1.secret' }) });
      // No body, so no JSON content-type: Fastify rejects an empty JSON body with a 400.
      expect(init.body).toBeUndefined();
      expect((init.headers as Record<string, string>)['content-type']).toBeUndefined();
      expect(lastServerContactOn()).toBe('2026-09-12T12:00:00Z');
    });

    it('returns nothing on an unenrolled device', async () => {
      clearDeviceCredential();
      expect(await createConnector({ onDeenrolled: vi.fn() }).fetchCredentials()).toBeNull();
    });

    it('treats a 401 as de-enrollment', async () => {
      vi.stubGlobal('fetch', respond(401, { error: 'unauthorized', message: 'no' }));
      const onDeenrolled = vi.fn(async () => undefined);

      expect(await createConnector({ onDeenrolled }).fetchCredentials()).toBeNull();
      expect(onDeenrolled).toHaveBeenCalledOnce();
    });
  });

  describe('uploadData', () => {
    it('sends the transaction in the contract shape and completes it once acknowledged', async () => {
      const fetch = respond(200, { applied: 1, duplicates: 0, rejected: [], serverTime: '2026-09-12T12:05:00Z' });
      vi.stubGlobal('fetch', fetch);
      const db = fakeDatabase();
      const { transaction, complete } = transactionOf([entry({ op: 'PUT' as CrudEntry['op'], table: 'patients', id: 'X-Y-000001-K2', opData: { fullName: 'Amaka' } })]);
      db.transactions.push(transaction);

      await createConnector({ onDeenrolled: vi.fn() }).uploadData(db as never);

      expect(JSON.parse(String((fetch.mock.calls[0]?.[1] as RequestInit).body))).toEqual({
        transactionId: 3,
        mutations: [{ clientId: 7, op: 'put', table: 'patient', id: 'X-Y-000001-K2', data: { fullName: 'Amaka' } }],
      });
      expect(complete).toHaveBeenCalledOnce();
      expect(lastServerContactOn()).toBe('2026-09-12T12:05:00Z');
    });

    it('completes a transaction the server rejected — the refusal lives in the reconcile queue, not the retry loop', async () => {
      vi.stubGlobal('fetch', respond(200, { applied: 0, duplicates: 0, rejected: [{ clientId: 7, table: 'patient', id: 'x', category: 'authorization', reason: 'no' }], serverTime: '2026-09-12T12:05:00Z' }));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const db = fakeDatabase();
      const { transaction, complete } = transactionOf([entry({ op: 'PUT' as CrudEntry['op'], table: 'patients', id: 'x' })]);
      db.transactions.push(transaction);

      await createConnector({ onDeenrolled: vi.fn() }).uploadData(db as never);

      expect(complete).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('leaves the transaction queued when the server fails, so PowerSync retries it', async () => {
      vi.stubGlobal('fetch', respond(503, { error: 'down', message: 'later' }));
      const db = fakeDatabase();
      const { transaction, complete } = transactionOf([entry({ op: 'PUT' as CrudEntry['op'], table: 'patients', id: 'x' })]);
      db.transactions.push(transaction);

      await expect(createConnector({ onDeenrolled: vi.fn() }).uploadData(db as never)).rejects.toThrow();
      expect(complete).not.toHaveBeenCalled();
    });

    it('treats a 401 as de-enrollment and stops', async () => {
      vi.stubGlobal('fetch', respond(401, { error: 'unauthorized', message: 'no' }));
      const onDeenrolled = vi.fn(async () => undefined);
      const db = fakeDatabase();
      const { transaction, complete } = transactionOf([entry({ op: 'PUT' as CrudEntry['op'], table: 'patients', id: 'x' })]);
      db.transactions.push(transaction);

      await expect(createConnector({ onDeenrolled }).uploadData(db as never)).rejects.toThrow();
      expect(onDeenrolled).toHaveBeenCalledOnce();
      expect(complete).not.toHaveBeenCalled();
    });
  });
});
