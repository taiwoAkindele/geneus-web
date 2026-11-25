import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { fakeDatabase } from './testing/fakeDatabase';

const a = {
  deviceId: 'device:A',
  facilityId: 'A',
  credential: 'device:A.synthetic',
  syncEndpoint: 'http://sync',
};

const b = {
  deviceId: 'device:B',
  facilityId: 'B',
  credential: 'device:B.synthetic',
  syncEndpoint: 'http://sync',
};

const pinA = { salt: 'synthetic-salt', hash: 'synthetic-A', iterations: 100000, digits: 6 };

/**
 * A switch ends in a page reload in the app, so the module keeps its
 * "switching" state for good. Each test loads the modules afresh instead.
 */
const freshModules = async () => {
  vi.resetModules();

  return {
    storage: await import('@/lib/secureStorage'),
    database: await import('./database'),
    credential: await import('./deviceCredential'),
    workspaces: await import('./facilityWorkspaces'),
  };
};

type Modules = Awaited<ReturnType<typeof freshModules>>;

/** Signed in at A, with B already a workspace on this device. */
const twoWorkspaces = async (modules: Modules, credentialsAtB: Record<string, unknown>) => {
  const { storage, database, credential } = modules;

  storage.resetSecureStorageForTests();
  await credential.saveDeviceCredential(a);
  await storage.secureSet('geneus.credentials', JSON.stringify({ 'staff:A': pinA }));
  await storage.secureSet(
    'geneus.facilityWorkspaces',
    JSON.stringify({
      active: a.deviceId,
      entries: [
        {
          facilityId: 'A',
          deviceId: a.deviceId,
          name: 'A',
          databaseName: 'geneus-encrypted.sqlite',
          legacy: true,
          prepared: true,
          values: { 'geneus.device': JSON.stringify(a) },
        },
        {
          facilityId: 'B',
          deviceId: b.deviceId,
          name: 'B',
          databaseName: 'geneus-B.sqlite',
          legacy: false,
          prepared: true,
          values: {
            'geneus.device': JSON.stringify(b),
            'geneus.credentials': JSON.stringify(credentialsAtB),
          },
        },
      ],
    }),
  );

  localStorage.setItem('geneus.signedInStaffId', 'staff:A');
  localStorage.setItem('geneus.lastActivityOn', String(Date.now()));

  const db = fakeDatabase({ ps_crud: [{ n: 0 }] });
  db.close = vi.fn(async () => {});
  database.setDatabaseForTests(db);
};

const identity = (staffId?: string) => ({
  sourceStaffId: 'staff:A',
  facilityId: 'B',
  deviceId: b.deviceId,
  ...(staffId ? { staffId } : {}),
  personId: 'person:shared',
  createdOn: Date.now(),
});

const credentialsNow = (modules: Modules) =>
  JSON.parse(modules.storage.secureGet('geneus.credentials') ?? '{}');

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('window', { location: { replace: vi.fn() } });
  vi.stubGlobal('navigator', {
    onLine: true,
    locks: {
      request: (_name: string, _options: unknown, callback: (lock: object) => unknown) =>
        Promise.resolve(callback({})),
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('one PIN per person on this device', () => {
  it('sets up the PIN used at A for the same person at B, whatever their role', async () => {
    const modules = await freshModules();
    await twoWorkspaces(modules, { 'staff:otherB': { hash: 'synthetic-other' } });

    await modules.workspaces.switchFacilityWorkspace(b.deviceId, undefined, identity('staff:B'));

    expect(credentialsNow(modules)).toEqual({
      'staff:otherB': { hash: 'synthetic-other' },
      'staff:B': pinA,
    });
  });

  it('never replaces a PIN already chosen at B', async () => {
    const modules = await freshModules();
    const chosenAtB = { hash: 'synthetic-chosen-at-B' };
    await twoWorkspaces(modules, { 'staff:B': chosenAtB });

    await modules.workspaces.switchFacilityWorkspace(b.deviceId, undefined, identity('staff:B'));

    expect(credentialsNow(modules)).toEqual({ 'staff:B': chosenAtB });
  });

  it('copies nothing when the server has not confirmed who the person is at B', async () => {
    const modules = await freshModules();
    await twoWorkspaces(modules, {});

    await modules.workspaces.switchFacilityWorkspace(b.deviceId, undefined, identity());

    expect(credentialsNow(modules)).toEqual({});
  });
});
