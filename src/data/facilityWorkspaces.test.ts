import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests, secureGet, secureSet } from '@/lib/secureStorage';
import { activeWorkspace, ensureFacilityWorkspace, forgetActiveWorkspace, listFacilityWorkspaces, recoverWorkspaceActivation, switchFacilityWorkspace } from './facilityWorkspaces';
import { setDatabaseForTests } from './database';
import { fakeDatabase } from './testing/fakeDatabase';
import { saveDeviceCredential, getDeviceCredential } from './deviceCredential';
import { createConnector } from './connector';
import { pendingFacilityIdentity } from '@/session/facilityIdentity';
import { Facility, Staff } from '@shared';
import { enrollmentProof, pendingFacilityCreation, saveFacilityCreation } from './facilitySetup';

const a = { deviceId: 'device:A', facilityId: 'A', credential: 'device:A.synthetic', syncEndpoint: 'http://sync' };
const b = { deviceId: 'device:B', facilityId: 'B', credential: 'device:B.synthetic', syncEndpoint: 'http://sync' };
beforeEach(() => { resetSecureStorageForTests(); vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { setDatabaseForTests(undefined); vi.unstubAllGlobals(); resetSecureStorageForTests(); });
describe('separate facility workspaces', () => {
  it('adopts the original database without renaming or clearing it', async () => {
    await saveDeviceCredential(a); await ensureFacilityWorkspace(a);
    expect(activeWorkspace()).toMatchObject({ facilityId: 'A', databaseName: 'geneus-encrypted.sqlite', legacy: true });
    await ensureFacilityWorkspace(a);
    expect(listFacilityWorkspaces()).toHaveLength(1);
  });
  it('recovers interrupted activation into B without inheriting A’s credentials, PINs or database key', async () => {
    await saveDeviceCredential(a);
    await secureSet('geneus.dbKey', 'key:A'); await secureSet('geneus.credentials', '{"staff:A":"synthetic"}');
    await secureSet('geneus.facilityWorkspaces', JSON.stringify({ active: a.deviceId, pendingActivation: b.deviceId, entries: [
      { facilityId: 'A', deviceId: a.deviceId, name: 'A', databaseName: 'geneus-encrypted.sqlite', legacy: true, values: { 'geneus.device': JSON.stringify(a), 'geneus.dbKey': 'key:A', 'geneus.credentials': '{"staff:A":"synthetic"}' } },
      { facilityId: 'B', deviceId: b.deviceId, name: 'B', databaseName: 'geneus-B.sqlite', legacy: false, values: { 'geneus.device': JSON.stringify(b), 'geneus.dbKey': 'key:B' } },
    ] }));
    await recoverWorkspaceActivation();
    expect(getDeviceCredential()).toEqual(b);
    expect(secureGet('geneus.dbKey')).toBe('key:B');
    expect(secureGet('geneus.credentials')).toBeNull();
    expect(activeWorkspace()?.facilityId).toBe('B');
    const directory = JSON.parse(secureGet('geneus.facilityWorkspaces')!);
    expect(directory.entries[0].values['geneus.dbKey']).toBe('key:A');
    expect(directory.pendingActivation).toBeUndefined();
    await forgetActiveWorkspace();
    expect(listFacilityWorkspaces().map((e) => e.facilityId)).toEqual(['A']);
    expect(JSON.parse(secureGet('geneus.facilityWorkspaces')!).entries[0].values['geneus.dbKey']).toBe('key:A');
  });
  it('binds an existing sync connector to A even if active credential slots change to B', async () => {
    await saveDeviceCredential(a);
    const connector = createConnector({ onDeenrolled: vi.fn() });
    await saveDeviceCredential(b);
    const fetcher = vi.fn(async (_url: unknown, _request: unknown) => new Response(JSON.stringify({ token: 'synthetic', syncEndpoint: 'http://sync', expiresOn: '2026-10-30T12:00:00Z', serverTime: '2026-10-30T11:00:00Z', keys: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetcher);
    await connector.fetchCredentials();
    expect((fetcher.mock.calls[0][1] as RequestInit).headers).toMatchObject({ authorization: `Bearer ${a.credential}` });
    expect(secureGet('geneus.lastServerContactOn')).toBeNull();
  });
  it('refuses a switch while another tab holds the workspace without closing or clearing the current database', async () => {
    await saveDeviceCredential(a); await ensureFacilityWorkspace(a);
    const db = fakeDatabase();
    db.close = vi.fn(async () => {}); db.disconnectAndClear = vi.fn(async () => {});
    setDatabaseForTests(db);
    vi.stubGlobal('navigator', { onLine: true, locks: { request: (_name: string, options: { mode: string }, callback: (lock: object | null) => unknown) => Promise.resolve(callback(options.mode === 'exclusive' ? null : {})) } });
    await expect(switchFacilityWorkspace(b.deviceId)).rejects.toThrow(/Close other Geneus tabs/);
    expect(db.close).not.toHaveBeenCalled();
    expect(db.disconnectAndClear).not.toHaveBeenCalled();
    expect(getDeviceCredential()).toEqual(a);
    expect(activeWorkspace()?.facilityId).toBe('A');
  });
  it('journals the destination identity and only its own PIN while preserving the source queue and keys', async () => {
    await saveDeviceCredential(a); await ensureFacilityWorkspace(a);
    await secureSet('geneus.dbKey', 'synthetic-key:A');
    const pin = { salt: 'synthetic-salt', hash: 'synthetic-own', iterations: 100000, digits: 6 };
    await secureSet('geneus.credentials', JSON.stringify({ 'staff:A': pin, 'staff:otherA': { hash: 'synthetic-other' } }));
    localStorage.setItem('geneus.signedInStaffId', 'staff:A');
    localStorage.setItem('geneus.lastActivityOn', String(Date.now()));
    const db = fakeDatabase({ ps_crud: [{ n: 3 }] });
    db.close = vi.fn(async () => {}); db.disconnectAndClear = vi.fn(async () => {}); setDatabaseForTests(db);
    const replace = vi.fn(); vi.stubGlobal('window', { location: { replace } });
    vi.stubGlobal('navigator', { onLine: true, locks: { request: (_name: string, _options: unknown, callback: (lock: object) => unknown) => Promise.resolve(callback({})) } });
    const proof = enrollmentProof();
    const device = { deviceId: proof.deviceId, facilityId: 'B-PHC', credential: `${proof.deviceId}.${proof.deviceSecret}`, syncEndpoint: 'http://sync' };
    const envelope = { facilityId: device.facilityId, deviceId: device.deviceId, schemaVersion: 4, createdBy: 'system', createdOn: new Date().toISOString() };
    const facility = Facility.parse({ ...envelope, id: device.facilityId, code: device.facilityId, type: 'facility', name: 'Synthetic second facility', state: 'Lagos', lga: 'Eti-Osa', level: 'phc' });
    const admin = Staff.parse({ ...envelope, id: 'staff:B', staffId: 'staff:B', type: 'staff', fullName: 'Synthetic admin', role: 'facility_admin', active: true, personId: 'person:shared' });
    await saveFacilityCreation({ sourceFacilityId: 'A', payload: { code: facility.code, name: facility.name, state: facility.state, lga: facility.lga, level: facility.level, actorStaffId: 'staff:A', organizationId: 'org:synthetic', requestId: crypto.randomUUID(), ...proof }, result: { facility, admin, device, organization: { id: 'org:synthetic', name: 'Synthetic group' } } });
    const identity = { sourceStaffId: 'staff:A', facilityId: device.facilityId, deviceId: device.deviceId, staffId: 'staff:B', personId: 'person:shared', createdOn: Date.now() };
    await switchFacilityWorkspace(device.deviceId, device, identity);
    expect(getDeviceCredential()).toEqual(device);
    expect(secureGet('geneus.dbKey')).toBeNull();
    expect(JSON.parse(secureGet('geneus.credentials')!)).toEqual({ 'staff:B': pin });
    expect(pendingFacilityIdentity()).toEqual(identity);
    expect(localStorage.getItem('geneus.signedInStaffId')).toBe('staff:B');
    const directory = JSON.parse(secureGet('geneus.facilityWorkspaces')!);
    expect(directory.entries[0]).toMatchObject({ facilityId: 'A', pending: 3, values: { 'geneus.dbKey': 'synthetic-key:A' } });
    expect(JSON.parse(directory.entries[0].values['geneus.credentials'])).toHaveProperty('staff:otherA');
    expect(db.close).toHaveBeenCalledOnce(); expect(db.disconnectAndClear).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/home');
    expect(pendingFacilityCreation('A', 'staff:A')).toBeUndefined();
  });
});
