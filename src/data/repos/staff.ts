import type { AuthorizationContext, Role, RosterShift, Staff, StaffPermission } from '@shared';
import { allOfType, envelope, findRecord, insertRecord, newId, updateRecord } from '../db';

export const listStaff = () => allOfType<Staff>('staff');
export const listShifts = () => allOfType<RosterShift>('roster_shift');

export const createStaff = (
  staff: { fullName: string; role: Role; permission: StaffPermission },
  context: AuthorizationContext,
): Promise<Staff> => {
  const staffId = newId('staff');
  return insertRecord<Staff>(context, 'staff:manage', 'staff', {
    ...envelope(context),
    id: staffId,
    type: 'staff',
    staffId,
    fullName: staff.fullName,
    role: staff.role,
    permission: staff.permission,
    active: true,
  });
};

export const setPermission = async (
  staff: Staff,
  permission: StaffPermission,
  context: AuthorizationContext,
): Promise<void> => {
  await updateRecord<Staff>(context, 'staff:permission', 'staff', staff.id, { permission });
};

export const removeStaff = async (staff: Staff, context: AuthorizationContext): Promise<void> => {
  await updateRecord<Staff>(context, 'staff:deactivate', 'staff', staff.id, { active: false });
};

export const today = (): string => new Date().toISOString().slice(0, 10);

const shiftId = (staffId: string, day: string) => `roster_shift:${staffId}:${day}`;

export const findShift = (shifts: RosterShift[], staffId: string, day = today()): RosterShift | undefined =>
  shifts.find((shift) => shift.id === shiftId(staffId, day));

/**
 * Sets the staff member's window for that day, replacing an existing one.
 * Shifts are written unsigned; geneus-server signs them once they sync up
 * (server PLAN §4.1), and a shift grants access either way.
 */
export const assignShift = async (
  shift: { staffId: string; day: string; startsAt: string; endsAt: string },
  context: AuthorizationContext,
): Promise<void> => {
  const id = shiftId(shift.staffId, shift.day);
  const existing = await findRecord<RosterShift>('roster_shift', id);
  if (existing) {
    await updateRecord<RosterShift>(context, 'roster:assign', 'roster_shift', id, {
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
    });
    return;
  }
  await insertRecord<RosterShift>(context, 'roster:assign', 'roster_shift', {
    ...envelope(context),
    id,
    type: 'roster_shift',
    staffId: shift.staffId,
    startsAt: shift.startsAt,
    endsAt: shift.endsAt,
  });
};

/** Supervisor "extend for the day" (PRD §14.1) — a logged, single-staff override. */
export const extendShift = async (shift: RosterShift, until: string, context: AuthorizationContext): Promise<void> => {
  await updateRecord<RosterShift>(context, 'roster:extend', 'roster_shift', shift.id, { extendedUntil: until });
};
