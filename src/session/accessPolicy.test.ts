import { describe, expect, it } from 'vitest';
import type { RosterShift } from '@shared';
import { accessFor, SESSION_IDLE_MS, maySignIn, mayStaySignedIn } from './accessPolicy';

const NOW = Date.parse('2026-10-24T12:00:00Z');
const MINUTE = 60_000;
const shift = (startsAt: string, endsAt: string, extendedUntil?: string): RosterShift => ({
  id: 'roster_shift:x', type: 'roster_shift', facilityId: 'OOE-PHC', schemaVersion: 3,
  createdBy: 'staff:admin', createdOn: '2026-10-24T06:00:00Z', deviceId: 'device-1',
  staffId: 'staff:x', startsAt, endsAt, extendedUntil,
});
const onNow = shift('2026-10-24T08:00:00Z', '2026-10-24T16:00:00Z');
const ended = shift('2026-10-24T04:00:00Z', '2026-10-24T11:00:00Z');
const nurse = { role: 'nurse' as const };

describe('fresh sign-in access', () => {
  it('keeps existing staff shift-based unless around-the-clock access was assigned', () => {
    expect(accessFor(nurse)).toBe('shift');
    expect(maySignIn({ staff: nurse, shift: onNow }, NOW)).toBe(true);
    expect(maySignIn({ staff: nurse, shift: ended }, NOW)).toBe(false);
    expect(maySignIn({ staff: nurse, shift: undefined }, NOW)).toBe(false);
  });
  it('lets staff with 24-hour access sign in without a roster at any hour', () => {
    const staff = { ...nurse, loginAccess: 'always' as const };
    expect(accessFor(staff)).toBe('always');
    for (const hour of [0, 8, 16, 23]) {
      expect(maySignIn({ staff, shift: undefined }, Date.parse(`2026-10-24T${String(hour).padStart(2, '0')}:00:00Z`))).toBe(true);
    }
  });
  it('counts supervisor extensions when deciding a fresh sign-in', () => {
    const extended = shift('2026-10-24T04:00:00Z', '2026-10-24T11:00:00Z', '2026-10-24T14:00:00Z');
    expect(maySignIn({ staff: nurse, shift: extended }, NOW)).toBe(true);
  });
  it('does not make an administrator depend on a roster setting', () => {
    const staff = { role: 'nurse' as const, additionalRoles: ['facility_admin' as const], loginAccess: 'shift' as const };
    expect(accessFor(staff)).toBe('admin');
    expect(maySignIn({ staff, shift: undefined }, NOW)).toBe(true);
  });
});

describe('authenticated session lifetime', () => {
  it('keeps staff signed in after the exact end and after their roster disappears at midnight', () => {
    expect(mayStaySignedIn({ staff: nurse, shift: onNow }, Date.parse(onNow.endsAt), Date.parse(onNow.endsAt) - MINUTE)).toBe(true);
    expect(mayStaySignedIn({ staff: nurse, shift: ended }, NOW, NOW - MINUTE)).toBe(true);
    expect(mayStaySignedIn({ staff: nurse, shift: undefined }, NOW + 24 * 60 * MINUTE, NOW + 24 * 60 * MINUTE - MINUTE)).toBe(true);
  });
  it('expires every role and access mode after thirty minutes idle', () => {
    for (const role of ['nurse', 'cashier', 'records_officer', 'facility_admin'] as const) {
      for (const loginAccess of ['always', 'shift'] as const) {
        const entry = { staff: { role, loginAccess }, shift: onNow };
        expect(mayStaySignedIn(entry, NOW, NOW - 29 * MINUTE)).toBe(true);
        expect(mayStaySignedIn(entry, NOW, NOW - SESSION_IDLE_MS)).toBe(false);
        expect(mayStaySignedIn(entry, NOW, NOW - 24 * 60 * MINUTE)).toBe(false);
        expect(mayStaySignedIn(entry, NOW, NOW + MINUTE)).toBe(false);
      }
    }
  });
  it('does not restore a saved identity after its session marker was cleared', () => {
    expect(mayStaySignedIn({ staff: nurse, shift: onNow }, NOW, undefined)).toBe(false);
    expect(mayStaySignedIn({ staff: { ...nurse, loginAccess: 'always' }, shift: undefined }, NOW, undefined)).toBe(false);
  });
  it('preserves administrator inactivity expiry independently of shift end', () => {
    const admin = { role: 'facility_admin' as const };
    expect(mayStaySignedIn({ staff: admin, shift: ended }, NOW, NOW - MINUTE)).toBe(true);
    expect(mayStaySignedIn({ staff: admin, shift: undefined }, NOW, NOW - SESSION_IDLE_MS)).toBe(false);
    expect(mayStaySignedIn({ staff: admin, shift: onNow }, NOW, undefined)).toBe(false);
  });
  it('also retains inactivity expiry for an additional administrator role', () => {
    const staff = { ...nurse, additionalRoles: ['facility_admin' as const] };
    expect(mayStaySignedIn({ staff, shift: undefined }, NOW, NOW - 29 * MINUTE)).toBe(true);
    expect(mayStaySignedIn({ staff, shift: undefined }, NOW, NOW - SESSION_IDLE_MS)).toBe(false);
  });
});
