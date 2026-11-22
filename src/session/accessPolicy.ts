import { hasRole, type RosterShift, type Staff } from '@shared';

/** Every staff session expires after inactivity, independently of sign-in hours. */
export const SESSION_IDLE_MS = 30 * 60_000;
export type Access = 'shift' | 'always' | 'admin';
type StaffLogin = Pick<Staff, 'role' | 'additionalRoles' | 'loginAccess'>;

export const accessFor = (staff: StaffLogin): Access => {
  if (hasRole(staff, 'facility_admin')) {
    return 'admin';
  }

  return staff.loginAccess === 'always' ? 'always' : 'shift';
};

const ACCESS_LABELS: Record<Access, string> = {
  admin: 'Admin access',
  always: '24-hour access',
  shift: 'Shift-based access',
};

export const accessLabel = (access: Access): string => ACCESS_LABELS[access];

export const shiftEnd = (shift: RosterShift): number =>
  new Date(shift.extendedUntil ?? shift.endsAt).getTime();
export const covers = (shift: RosterShift, at: number): boolean =>
  new Date(shift.startsAt).getTime() <= at && at < shiftEnd(shift);

/** Roster windows gate fresh PIN sign-in, not an already authenticated session. */
export const maySignIn = (
  entry: { staff: StaffLogin; shift: RosterShift | undefined },
  at: number,
): boolean => accessFor(entry.staff) !== 'shift' || Boolean(entry.shift && covers(entry.shift, at));

/** A shift ending, or disappearing at midnight, never signs staff out. */
export const mayStaySignedIn = (
  _entry: { staff: StaffLogin; shift: RosterShift | undefined },
  now: number,
  lastActivityOn: number | undefined,
): boolean =>
  lastActivityOn !== undefined &&
  Number.isFinite(lastActivityOn) &&
  now >= lastActivityOn &&
  now - lastActivityOn < SESSION_IDLE_MS;
