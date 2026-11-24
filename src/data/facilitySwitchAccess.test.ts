import { afterEach, expect, it, vi } from 'vitest';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests, secureGet, secureSet } from '@/lib/secureStorage';
import { setDatabaseForTests } from './database';
import { fakeDatabase } from './testing/fakeDatabase';
import { saveDeviceCredential } from './deviceCredential';
import { ensureFacilityWorkspace, switchFacilityWorkspace } from './facilityWorkspaces';
import { pendingFacilityIdentity } from '@/session/facilityIdentity';
import { staffSessionToken } from '@/lib/api/staffSession';

afterEach(() => {
  setDatabaseForTests(undefined);
  vi.unstubAllGlobals();
  resetSecureStorageForTests();
});

it('a switch carries the person and their server session, never their PIN', async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  resetSecureStorageForTests();

  const source = {
    facilityId: 'A',
    deviceId: 'device:A',
    credential: 'device:A.synthetic',
    syncEndpoint: 'http://sync',
  };

  const target = {
    facilityId: 'B',
    deviceId: 'device:B',
    credential: 'device:B.synthetic',
    syncEndpoint: 'http://sync',
  };

  await saveDeviceCredential(source);
  await ensureFacilityWorkspace(source);
  await secureSet(
    'geneus.credentials',
    JSON.stringify({
      'staff:A': { salt: 'synthetic', hash: 'synthetic', iterations: 100000, digits: 6 },
    }),
  );

  localStorage.setItem('geneus.signedInStaffId', 'staff:A');
  localStorage.setItem('geneus.lastActivityOn', String(Date.now()));
  setDatabaseForTests(fakeDatabase());
  const replace = vi.fn();
  vi.stubGlobal('window', { location: { replace }, dispatchEvent: vi.fn() });
  vi.stubGlobal('navigator', {
    onLine: true,
    locks: {
      request: (_name: string, _options: unknown, callback: (lock: object) => unknown) =>
        Promise.resolve(callback({})),
    },
  });

  vi.stubGlobal('sessionStorage', memoryStorage());

  const session = {
    token: 'server-session-at-B',
    staffId: 'staff:B',
    expiresOn: new Date(Date.now() + 60 * 60_000).toISOString(),
    idleMinutes: 30,
  };

  await switchFacilityWorkspace(
    target.deviceId,
    target,
    {
      sourceStaffId: 'staff:A',
      facilityId: 'B',
      deviceId: target.deviceId,
      staffId: 'staff:B',
      personId: 'person:linked',
      createdOn: Date.now(),
    },
    session,
  );

  expect(secureGet('geneus.credentials')).toBeNull();
  expect(pendingFacilityIdentity()?.staffId).toBe('staff:B');
  expect(localStorage.getItem('geneus.signedInStaffId')).toBe('staff:B');
  expect(staffSessionToken({ userId: 'staff:B', deviceId: target.deviceId })).toBe(session.token);
  expect(replace).toHaveBeenCalledWith('/home');
});
