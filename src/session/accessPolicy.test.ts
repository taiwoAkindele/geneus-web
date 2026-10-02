import { describe, expect, it } from 'vitest';
import type { RosterShift } from '@shared';
import { accessFor, ADMIN_IDLE_MS, mayStaySignedIn } from './accessPolicy';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const MINUTE = 60_000;

const shift = (startsAt: string, endsAt: string, extendedUntil?: string): RosterShift => ({
  id: 'roster_shift:x',
  type: 'roster_shift',
  facilityId: 'OOE-PHC',
  schemaVersion: 3,
  createdBy: 'staff:admin',
  createdOn: '2026-10-02T06:00:00Z',
  deviceId: 'device-1',
  staffId: 'staff:x',
  startsAt,
  endsAt,
  extendedUntil,
});

const onNow = shift('2026-10-02T08:00:00Z', '2026-10-02T16:00:00Z');
const ended = shift('2026-10-02T04:00:00Z', '2026-10-02T11:00:00Z');

/**
 * "No shift, no access" (PRD §14.1), with the facility admin's exception: any
 * time, signed out after 30 idle minutes instead of at a shift's end.
 */
describe('who may stay signed in', () => {
  it('holds a nurse to her shift, whatever she is doing', () => {
    const nurse = { role: 'nurse' as const };

    expect(mayStaySignedIn({ staff: nurse, shift: onNow }, NOW, NOW)).toBe(true);
    expect(mayStaySignedIn({ staff: nurse, shift: ended }, NOW, NOW)).toBe(false);
    expect(mayStaySignedIn({ staff: nurse, shift: undefined }, NOW, NOW)).toBe(false);
  });

  it('counts a supervisor extension as part of the shift', () => {
    const extended = shift('2026-10-02T04:00:00Z', '2026-10-02T11:00:00Z', '2026-10-02T14:00:00Z');
    expect(mayStaySignedIn({ staff: { role: 'nurse' }, shift: extended }, NOW, NOW)).toBe(true);
  });

  it('keeps a facility admin signed in with no shift while they are using the app', () => {
    const admin = { staff: { role: 'facility_admin' as const }, shift: undefined };

    expect(accessFor(admin.staff)).toBe('admin');
    expect(mayStaySignedIn(admin, NOW, NOW - 29 * MINUTE)).toBe(true);
  });

  it('signs a facility admin out after 30 idle minutes, even in the middle of a shift', () => {
    expect(mayStaySignedIn({ staff: { role: 'facility_admin' }, shift: undefined }, NOW, NOW - ADMIN_IDLE_MS)).toBe(false);
    expect(mayStaySignedIn({ staff: { role: 'facility_admin' }, shift: onNow }, NOW, NOW - 31 * MINUTE)).toBe(false);
  });

  it('never lets a shift end sign out an admin who is active', () => {
    expect(mayStaySignedIn({ staff: { role: 'facility_admin' }, shift: ended }, NOW, NOW - MINUTE)).toBe(true);
  });

  it('treats an admin with no recorded activity as idle, so a session cannot be resumed without a PIN', () => {
    expect(mayStaySignedIn({ staff: { role: 'facility_admin' }, shift: undefined }, NOW, undefined)).toBe(false);
  });
});
