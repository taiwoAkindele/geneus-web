import { rolesFor, type AssignablePermission, type Role, type Staff } from '@shared';

export const ROLE_LABELS: Record<Role, string> = {
  chew: 'CHEW', nurse: 'Nurse', doctor: 'Doctor', records_officer: 'Records',
  facility_admin: 'Facility Admin', supervisor: 'Supervisor', cashier: 'Cashier',
};
export const roleLabel = (staff: Pick<Staff, 'role' | 'additionalRoles'>): string =>
  rolesFor(staff).map((role) => ROLE_LABELS[role]).join(' + ');

export const PERMISSION_LABELS: Record<AssignablePermission, string> = {
  'patient:create': 'Register patients', 'patient:update': 'Edit patient details',
  'patient_identity:review': 'Flag patient identity reviews', 'patient_identity:resolve': 'Resolve patient identities',
  'appointment:create': 'Book appointments', 'appointment:update': 'Manage booking attendance and dates', 'visit:create': 'Record visits',
  'encounter:record': 'Record clinical encounter steps',
  'handoff:create': 'Send patients to another unit', 'handoff:update': 'Update unit handoffs',
  'referral:create': 'Create referrals', 'referral:update': 'Update referrals',
  'register_entry:create': 'Add register entries', 'stock_movement:create': 'Record stock movements',
  'charge:create': 'Raise patient charges', 'payment:receive': 'Receive payments',
  'payment:waive': 'Discount or waive fees', 'payment:reverse': 'Reverse payments',
  'register_definition:publish': 'Configure registers', 'unit:manage': 'Manage units',
  'stock_item:manage': 'Manage stock items', 'fee_item:manage': 'Manage the fee schedule',
  'staff:manage': 'Add staff and edit names', 'staff:permission': 'Assign staff roles and permissions',
  'staff:deactivate': 'Remove staff access', 'roster:assign': 'Assign shifts',
  'roster:extend': 'Extend shifts', 'device:enroll': 'Enroll devices',
  'device:revoke': 'Revoke devices', 'sync_rejection:resolve': 'Resolve sync conflicts',
};
