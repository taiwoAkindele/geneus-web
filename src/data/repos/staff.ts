import { hasRole, type AuthorizationContext, type RosterShift, type Staff, type StaffPermission } from '@shared';
import { allOfType, envelope, findRecord, insertRecord, newId, updateRecord } from '../db';

import { calendarDate } from '@/lib/calendarDate';
import { shiftEnd } from '@/session/accessPolicy';
import { assertAllowed } from '@/auth/authorization';

export type StaffDetails = Pick<Staff, 'fullName' | 'role' | 'additionalRoles' | 'additionalPermissions' | 'permission' | 'loginAccess'>;

export const listStaff = () => allOfType<Staff>('staff');
export const listShifts = () => allOfType<RosterShift>('roster_shift');

export const createStaff = async (
  staff: StaffDetails,
  context: AuthorizationContext,
): Promise<Staff> => {
  assertAllowed(context, 'staff:manage');
  assertAllowed(context, 'staff:permission');
  const staffId = newId('staff');
  return insertRecord<Staff>(context, 'staff:manage', 'staff', {
    ...envelope(context),
    id: staffId,
    type: 'staff',
    staffId,
    fullName: staff.fullName,
    role: staff.role,
    additionalRoles: staff.additionalRoles,
    additionalPermissions: staff.additionalPermissions,
    permission: staff.permission,
    loginAccess: staff.loginAccess,
    active: true,
  });
};

const workingAdmin = (staff: Staff): boolean =>
  staff.active && staff.permission === 'read_write' && hasRole(staff, 'facility_admin');

const guardAdministrator = async (before: Staff, after: Staff): Promise<void> => {
  if (!workingAdmin(before) || workingAdmin(after)) return;
  const others = await listStaff();
  if (!others.some((member) => member.id !== before.id && workingAdmin(member))) {
    throw new Error('Keep at least one active facility administrator with write access');
  }
};

export const editStaff = async (staff: Staff, details: StaffDetails, context: AuthorizationContext): Promise<void> => {
  const changes: Partial<StaffDetails> = {};
  if (details.fullName.trim() !== staff.fullName) changes.fullName = details.fullName.trim();
  if (details.role !== staff.role) changes.role = details.role;
  if (details.permission !== staff.permission) changes.permission = details.permission;
  if ((details.loginAccess ?? 'shift') !== (staff.loginAccess ?? 'shift')) changes.loginAccess = details.loginAccess ?? 'shift';
  if (JSON.stringify(details.additionalRoles ?? []) !== JSON.stringify(staff.additionalRoles ?? [])) changes.additionalRoles = details.additionalRoles ?? [];
  if (JSON.stringify(details.additionalPermissions ?? []) !== JSON.stringify(staff.additionalPermissions ?? [])) changes.additionalPermissions = details.additionalPermissions ?? [];
  const accessChanged = Object.keys(changes).some((field) => field !== 'fullName');
  if (!Object.keys(changes).length) return;
  if ('fullName' in changes) assertAllowed(context, 'staff:manage');
  if (accessChanged) assertAllowed(context, 'staff:permission');
  await guardAdministrator(staff, { ...staff, ...changes });
  await updateRecord<Staff>(context, accessChanged ? 'staff:permission' : 'staff:manage', 'staff', staff.id, changes);
};

export const setPermission = async (
  staff: Staff,
  permission: StaffPermission,
  context: AuthorizationContext,
): Promise<void> => {
  assertAllowed(context, 'staff:permission');
  await guardAdministrator(staff, { ...staff, permission });
  await updateRecord<Staff>(context, 'staff:permission', 'staff', staff.id, { permission });
};

export const removeStaff = async (staff: Staff, context: AuthorizationContext): Promise<void> => {
  assertAllowed(context, 'staff:deactivate');
  await guardAdministrator(staff, { ...staff, active: false });
  await updateRecord<Staff>(context, 'staff:deactivate', 'staff', staff.id, { active: false });
};

export const today = (): string => calendarDate();

const shiftId = (staffId: string, day: string) => `roster_shift:${staffId}:${day}`;

/** Search instants first so a shift still works after crossing local midnight. */
export const findShift = (shifts: RosterShift[], staffId: string, at = Date.now()): RosterShift | undefined => {
  const staffShifts = shifts.filter((shift) => shift.staffId === staffId).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  const active = staffShifts.find((shift) => Date.parse(shift.startsAt) <= at && at < shiftEnd(shift));
  if (active) return active;
  const day = calendarDate(new Date(at));
  const sameDay = staffShifts.filter((shift) => calendarDate(shift.startsAt) === day);
  return [...sameDay].reverse().find((shift) => Date.parse(shift.startsAt) > at) ?? sameDay[0];
};

/**
 * Sets the staff member's window for that day, replacing an existing one.
 * Shifts are written unsigned; geneus-server signs them once they sync up
 * (server PLAN §4.1), and a shift grants access either way.
 */
export const assignShift = async (
  shift: { id?: string; staffId: string; day: string; startsAt: string; endsAt: string },
  context: AuthorizationContext,
): Promise<void> => {
  assertAllowed(context, 'roster:assign');
  const id = shift.id ?? shiftId(shift.staffId, shift.day);
  const existing = await findRecord<RosterShift>('roster_shift', id);
  if (shift.id && (!existing || existing.staffId !== shift.staffId)) throw new Error('This shift is no longer available for that staff member');
  if (existing) {
    await updateRecord<RosterShift>(context, 'roster:assign', 'roster_shift', id, {
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      // A previous extension must not override the newly assigned window.
      extendedUntil: shift.endsAt,
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
