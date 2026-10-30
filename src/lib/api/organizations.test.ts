import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests } from '@/lib/secureStorage';
import { saveDeviceCredential } from '@/data/deviceCredential';
import { resolveOrganizationFacility } from './organizations';

beforeEach(async () => {
  vi.stubGlobal('localStorage', memoryStorage()); resetSecureStorageForTests();
  await saveDeviceCredential({ facilityId: 'A', deviceId: 'device:A', credential: 'device:A.synthetic', syncEndpoint: 'http://sync' });
});
afterEach(() => { vi.unstubAllGlobals(); resetSecureStorageForTests(); });
const resolve = (prepared: boolean) => resolveOrganizationFacility('staff:A', 'B', { deviceId: 'device:B' }, prepared);
it('allows destination PIN sign-in on a prepared replica when the network is unavailable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
  expect(await resolve(true)).toBeUndefined();
  await expect(resolve(false)).rejects.toMatchObject({ code: 'offline' });
});
it('never treats an explicit membership or enrollment refusal as offline access', async () => {
  for (const status of [401, 403, 409]) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'not_provisioned', message: 'Access refused' }), { status, headers: { 'content-type': 'application/json' } })));
    await expect(resolve(true)).rejects.toMatchObject({ code: 'not_provisioned', status });
  }
});
it('allows a prepared replica during server downtime without manufacturing a new enrollment', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } })));
  expect(await resolve(true)).toBeUndefined();
  await expect(resolve(false)).rejects.toMatchObject({ status: 503 });
});
