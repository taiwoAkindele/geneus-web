import { hasRole, type RosterShift, type Staff } from '@shared';

/** Admin inactivity expiry is independent of a roster ending. */
export const ADMIN_IDLE_MS = 30 * 60_000;
export type Access = 'shift' | 'always' | 'admin';
type StaffLogin = Pick<Staff, 'role' | 'additionalRoles' | 'loginAccess'>;

export const accessFor = (staff: StaffLogin): Access =>
  hasRole(staff, 'facility_admin') ? 'admin' : staff.loginAccess === 'always' ? 'always' : 'shift';

export const accessLabel = (access: Access): string =>
  access === 'admin' ? 'Admin access' : access === 'always' ? '24-hour access' : 'Shift-based access';

export const shiftEnd = (shift: RosterShift): number => new Date(shift.extendedUntil ?? shift.endsAt).getTime();
export const covers = (shift: RosterShift, at: number): boolean =>
  new Date(shift.startsAt).getTime() <= at && at < shiftEnd(shift);

/** Roster windows gate fresh PIN sign-in, not an already authenticated session. */
export const maySignIn = (entry: { staff: StaffLogin; shift: RosterShift | undefined }, at: number): boolean =>
  accessFor(entry.staff) !== 'shift' || Boolean(entry.shift && covers(entry.shift, at));

/** A shift ending, or disappearing at midnight, never signs staff out. */
export const mayStaySignedIn = (
  entry: { staff: StaffLogin; shift: RosterShift | undefined },
  now: number,
  lastActivityOn: number | undefined,
): boolean =>
  lastActivityOn !== undefined &&
  (accessFor(entry.staff) !== 'admin' || now - lastActivityOn < ADMIN_IDLE_MS);
