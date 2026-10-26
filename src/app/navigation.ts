import type { AuthorizationContext } from '@shared';
import type { IconName } from '@/ui';

export type NavItem = { key: string; label: string; to: string; match: string; icon: IconName; bottom?: boolean };
type NavContext = Pick<AuthorizationContext, 'role' | 'roles' | 'permissions'>;

export const hasAdminWorkspace = (context: NavContext): boolean =>
  (context.roles ?? [context.role]).includes('facility_admin') ||
  context.permissions.some((permission) => ['staff:manage', 'staff:permission', 'staff:deactivate', 'roster:assign', 'unit:manage', 'fee_item:manage', 'stock_item:manage', 'device:enroll', 'device:revoke'].includes(permission));

/** Navigation follows all assigned duties; repositories still enforce each mutation. */
export const navigationFor = (context: NavContext): NavItem[] => {
  const roles = context.roles ?? [context.role];
  const admin = roles.includes('facility_admin');
  const clinical = !admin && (roles.some((role) => ['chew', 'nurse', 'doctor', 'supervisor'].includes(role)) || context.permissions.includes('encounter:record'));
  const frontDesk = !admin && !clinical;
  const dailyWork = roles.some((role) => role !== 'cashier') ||
    context.permissions.some((permission) => ['patient:create', 'patient:update', 'appointment:create', 'encounter:record', 'register_entry:create'].includes(permission));
  const items: NavItem[] = [
    { key: 'home', label: 'Home', to: '/home', match: '/home', icon: 'home', bottom: true },
    { key: 'patients', label: 'Patients', to: '/patients/search', match: '/patients', icon: 'patients', bottom: true },
  ];
  if (roles.some((role) => ['facility_admin', 'cashier', 'supervisor'].includes(role)) || context.permissions.some((permission) => ['payment:receive', 'payment:waive', 'fee_item:manage'].includes(permission))) {
    items.push({ key: 'billing', label: 'Billing', to: '/billing', match: '/billing', icon: 'registers', bottom: roles.includes('cashier') });
  }
  if (dailyWork) items.push(
    { key: 'appointments', label: 'Appointments', to: '/appointments', match: '/appointments', icon: 'clock', bottom: frontDesk },
    { key: 'encounters', label: 'Visits', to: '/encounters', match: '/encounters', icon: 'encounter', bottom: clinical },
    { key: 'registers', label: 'Registers', to: '/registers', match: '/registers', icon: 'registers', bottom: frontDesk },
    { key: 'units', label: 'Unit queue', to: '/units', match: '/units', icon: 'clock', bottom: clinical },
  );
  if (hasAdminWorkspace(context)) items.push({ key: 'admin', label: 'Admin', to: '/admin', match: '/admin', icon: 'patients', bottom: true });
  return items;
};
