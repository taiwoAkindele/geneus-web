import { RosterShift, Staff, type Role, type StaffPermission } from '@shared';
import { allOfType, assertCanWrite, db, envelope, newId, put, type WriteContext } from '../db';

export const listStaff = () => allOfType<Staff>('staff');
export const listShifts = () => allOfType<RosterShift>('roster_shift');

/**
 * Shifts are always written on the device; geneus-server signs them by sweep once they
 * replicate up (server PLAN §4.1), so a shift is unsigned until its first sync and
 * grants access either way. The contract requires the field, so an unsigned shift must
 * carry a marker that is visibly not-a-signature rather than plausible-looking.
 */
export const UNSIGNED_ROSTER = 'unsigned:local-development';

export const createStaff = (
  staff: { fullName: string; role: Role; permission: StaffPermission },
  context: WriteContext,
): Promise<Staff> => {
  assertCanWrite(context);
  const staffId = newId('staff');
  return put(
    Staff.parse({
      ...envelope(context),
      _id: staffId,
      type: 'staff',
      staffId,
      fullName: staff.fullName,
      role: staff.role,
      permission: staff.permission,
      active: true,
    }),
  );
};

export const setPermission = async (
  staff: Staff,
  permission: StaffPermission,
  context: WriteContext,
): Promise<void> => {
  assertCanWrite(context);
  await put(Staff.parse({ ...staff, permission }));
};

export const today = (): string => new Date().toISOString().slice(0, 10);

const shiftId = (staffId: string, day: string) => `roster_shift:${staffId}:${day}`;

export const findShift = (shifts: RosterShift[], staffId: string, day = today()): RosterShift | undefined =>
  shifts.find((shift) => shift._id === shiftId(staffId, day));

/** Replaces any existing window for that staff member on that day. */
export const assignShift = async (
  shift: { staffId: string; day: string; startsAt: string; endsAt: string },
  context: WriteContext,
): Promise<void> => {
  assertCanWrite(context);
  const id = shiftId(shift.staffId, shift.day);
  const existing = await db.get(id).catch(() => undefined);
  await put(
    RosterShift.parse({
      ...envelope(context),
      ...(existing ? { _rev: existing._rev } : {}),
      _id: id,
      type: 'roster_shift',
      staffId: shift.staffId,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      signature: UNSIGNED_ROSTER,
    }),
  );
};

/** Supervisor "extend for the day" (PRD §14.1) — a logged, single-staff override. */
export const extendShift = async (shift: RosterShift, until: string): Promise<void> => {
  await put(RosterShift.parse({ ...shift, extendedUntil: until }));
};

export const removeStaff = async (staff: Staff, context: WriteContext): Promise<void> => {
  assertCanWrite(context);
  await put(Staff.parse({ ...staff, active: false }));
};
