import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Staff, type RosterShift } from '@shared';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { assertSourceSession, canContinueFacilitySession, reuseAccountPin, sharesAccountPin, type FacilitySwitchIdentity } from './facilityIdentity';

const now = Date.parse('2026-10-30T12:00:00Z');
const identity: FacilitySwitchIdentity = { sourceStaffId: 'staff:A', facilityId: 'B', deviceId: 'device:B', staffId: 'staff:B', personId: 'person:shared', createdOn: now };
const staff = Staff.parse({ id: 'staff:B', staffId: 'staff:B', facilityId: 'B', deviceId: 'device:B', schemaVersion: 4, createdBy: 'system', createdOn: new Date(now).toISOString(), type: 'staff', fullName: 'Synthetic member', role: 'facility_admin', permission: 'read_write', active: true, personId: identity.personId });
const target = { staff, shift: undefined, facilityId: 'B', deviceId: 'device:B', lastServerContact: new Date(now).toISOString() };
beforeEach(() => vi.stubGlobal('localStorage', memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe('same person switching independently provisioned memberships', () => {
  it('requires the current authenticated source identity and refuses expired sessions', () => {
    localStorage.setItem('geneus.signedInStaffId', 'staff:A');
    localStorage.setItem('geneus.lastActivityOn', String(now));
    expect(() => assertSourceSession(identity, now)).not.toThrow();
    expect(() => assertSourceSession(identity, now + 30 * 60_000)).toThrow(/Sign in again/);
    expect(() => assertSourceSession({ ...identity, sourceStaffId: 'staff:someone-else' }, now)).toThrow();
  });
  it('matches the destination facility, device, person and active local membership', () => {
    expect(canContinueFacilitySession(identity, target, now)).toBe(true);
    for (const change of [{ facilityId: 'C' }, { deviceId: 'device:C' }, { staff: { ...staff, personId: 'person:other' } }, { staff: { ...staff, active: false } }, { staff: { ...staff, staffId: 'staff:other' } }, { lastServerContact: undefined }]) {
      expect(canContinueFacilitySession(identity, { ...target, ...change }, now)).toBe(false);
    }
    expect(canContinueFacilitySession(identity, target, now + 5 * 60_000)).toBe(false);
    expect(canContinueFacilitySession(identity, target, now - 1)).toBe(false);
  });
  it('uses the receiving membership sign-in hours rather than the source administrator role', () => {
    const localNurse = { ...staff, role: 'nurse' as const, loginAccess: 'shift' as const };
    expect(canContinueFacilitySession(identity, { ...target, staff: localNurse }, now)).toBe(false);
    const shift = { startsAt: new Date(now - 60_000).toISOString(), endsAt: new Date(now + 60_000).toISOString() } as RosterShift;
    expect(canContinueFacilitySession(identity, { ...target, staff: localNurse, shift }, now)).toBe(true);
  });
  it('copies only this person’s PIN into their new local membership and preserves existing destination PINs', () => {
    const source = JSON.stringify({ 'staff:A': { hash: 'synthetic-A' }, 'staff:other': { hash: 'synthetic-other' } });
    expect(JSON.parse(reuseAccountPin(source, undefined, 'staff:A', 'staff:B'))).toEqual({ 'staff:B': { hash: 'synthetic-A' } });
    const existing = JSON.stringify({ 'staff:B': { hash: 'synthetic-B' }, 'staff:local': { hash: 'synthetic-local' } });
    expect(JSON.parse(reuseAccountPin(source, existing, 'staff:A', 'staff:B'))).toEqual(JSON.parse(existing));
  });
  it('requires the already trusted destination PIN and respects independent resets and lockouts', () => {
    const pin = { salt: 'synthetic-salt', hash: 'synthetic-hash', iterations: 100000, digits: 6 };
    const source = JSON.stringify({ 'staff:A': pin });
    const target = JSON.stringify({ 'staff:B': pin });
    expect(sharesAccountPin(source, target, 'staff:A', 'staff:B', now)).toBe(true);
    expect(sharesAccountPin(source, undefined, 'staff:A', 'staff:B', now)).toBe(false);
    expect(sharesAccountPin(JSON.stringify({ 'staff:A': { ...pin, hash: 'new-after-source-reset' } }), target, 'staff:A', 'staff:B', now)).toBe(false);
    expect(sharesAccountPin(source, JSON.stringify({ 'staff:B': { ...pin, lockedUntil: now + 60000 } }), 'staff:A', 'staff:B', now)).toBe(false);
  });
});
