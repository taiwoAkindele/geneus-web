import { beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests } from '@/lib/secureStorage';
import { cacheFacilityDirectory, cachedFacilityDirectory, clearFacilityCreation, enrollmentProof, facilityOpeningProof, finishFacilitySetup, pendingFacilityCreation, saveFacilityCreation } from './facilitySetup';

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); resetSecureStorageForTests(); });
describe('facility setup recovery and organization metadata', () => {
  it('keeps lists separate for each local facility and staff identity', async () => {
    const directory = { organization: { id: 'org:1', name: 'Synthetic group' }, canCreateFacility: true, facilities: [{ id: 'A', name: 'Synthetic A', accessible: true, canEnrollDevice: true }] };
    await cacheFacilityDirectory('A', 'staff:A', directory);
    expect(cachedFacilityDirectory('A', 'staff:A')?.directory).toEqual(directory);
    expect(cachedFacilityDirectory('B', 'staff:A')).toBeUndefined();
    expect(cachedFacilityDirectory('A', 'staff:other')).toBeUndefined();
  });
  it('keeps retry proofs stable without overwriting another account or facility', async () => {
    const first = await facilityOpeningProof('A', 'staff:A', 'B');
    const other = await facilityOpeningProof('C', 'staff:C', 'D');
    expect(await facilityOpeningProof('A', 'staff:A', 'B')).toEqual(first);
    expect(first.deviceSecret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(other).not.toEqual(first);
    await finishFacilitySetup('B');
    expect(await facilityOpeningProof('C', 'staff:C', 'D')).toEqual(other);
    expect(await facilityOpeningProof('A', 'staff:A', 'B')).not.toEqual(first);
  });
  it('preserves immutable creation inputs across reloads and does not expose them to another account', async () => {
    const value = { sourceFacilityId: 'A', payload: { name: 'Synthetic second facility', code: 'B-PHC', state: 'Lagos', lga: 'Eti-Osa', level: 'phc' as const, actorStaffId: 'staff:A', organizationId: 'org:1', requestId: crypto.randomUUID(), ...enrollmentProof() } };
    await saveFacilityCreation(value);
    await saveFacilityCreation({ ...value, sourceFacilityId: 'C', payload: { ...value.payload, actorStaffId: 'staff:C', requestId: crypto.randomUUID() } });
    expect(pendingFacilityCreation('A', 'staff:A')).toEqual(value);
    expect(pendingFacilityCreation('A', 'staff:other')).toBeUndefined();
    await clearFacilityCreation('C', 'staff:C');
    expect(pendingFacilityCreation('A', 'staff:A')).toEqual(value);
    await finishFacilitySetup('unrelated');
    expect(pendingFacilityCreation('A', 'staff:A')).toEqual(value);
  });
});
