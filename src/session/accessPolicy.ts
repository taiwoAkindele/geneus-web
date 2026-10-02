import type { RosterShift, Staff } from '@shared';

/**
 * Who may be signed in right now (PRD §14.1). The rule is "no shift, no
 * access", with one exception: a facility admin may sign in at any time, so a
 * facility is never locked out of its own setup, staff and roster. With no
 * shift to end their session, an admin is signed out after 30 minutes without
 * using the app instead — a phone left unattended does not stay open with
 * admin rights. A shift ending never signs an admin out.
 */
export const ADMIN_IDLE_MS = 30 * 60_000;

export type Access = 'shift' | 'admin';

export const accessFor = (staff: Pick<Staff, 'role'>): Access => (staff.role === 'facility_admin' ? 'admin' : 'shift');

export const shiftEnd = (shift: RosterShift): number => new Date(shift.extendedUntil ?? shift.endsAt).getTime();

export const covers = (shift: RosterShift, at: number): boolean =>
  new Date(shift.startsAt).getTime() <= at && at < shiftEnd(shift);

/**
 * Whether a signed-in session may continue at `now`. `lastActivityOn` is when
 * the person last touched the app; with none recorded, an admin session is
 * treated as idle — it cannot be resumed without a PIN.
 */
export const mayStaySignedIn = (
  entry: { staff: Pick<Staff, 'role'>; shift: RosterShift | undefined },
  now: number,
  lastActivityOn: number | undefined,
): boolean =>
  accessFor(entry.staff) === 'admin'
    ? lastActivityOn !== undefined && now - lastActivityOn < ADMIN_IDLE_MS
    : Boolean(entry.shift && covers(entry.shift, now));
