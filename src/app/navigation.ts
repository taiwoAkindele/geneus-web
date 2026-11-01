import type { AuthorizationContext } from '@shared';
import type { IconName } from '@/ui';

/** Handoffs & unit queue is hidden until a facility needs it; /units still opens by address. */
export const UNIT_QUEUE_VISIBLE = false;

export type NavItem = { key: string; label: string; to: string; match: string; icon: IconName; bottom?: boolean; group?: 'Daily work' | 'Money' | 'Facility' };
type NavContext = Pick<AuthorizationContext, 'role' | 'roles' | 'permissions'>;

export const hasAdminWorkspace = (context: NavContext): boolean =>
  (context.roles ?? [context.role]).includes('facility_admin') ||
  context.permissions.some((permission) => ['staff:manage', 'staff:permission', 'staff:deactivate', 'roster:assign', 'unit:manage', 'fee_item:manage', 'stock_item:manage', 'device:enroll', 'device:revoke'].includes(permission));

/** Navigation follows all assigned duties; repositories still enforce each mutation. */
export const navigationFor = (context: NavContext): NavItem[] => {
  const roles = context.roles ?? [context.role];
  const admin = roles.includes('facility_admin');
  const clinical = roles.some((role) => ['chew', 'nurse', 'doctor', 'supervisor', 'laboratory_staff', 'pharmacy_staff'].includes(role)) || context.permissions.includes('encounter:record');
  // Extra duties expand destinations; they do not replace the primary duty's shortcut.
  const clinicalShortcut = ['chew', 'nurse', 'doctor', 'supervisor', 'laboratory_staff', 'pharmacy_staff'].includes(context.role) || (context.role === 'facility_admin' && clinical);
  const frontDesk = !clinicalShortcut && context.role !== 'cashier';
  const dailyWork = roles.some((role) => role !== 'cashier') ||
    context.permissions.some((permission) => ['patient:create', 'patient:update', 'appointment:create', 'encounter:record', 'register_entry:create'].includes(permission));
  const items: NavItem[] = [
    { key: 'home', label: 'Home', to: '/home', match: '/home', icon: 'home', bottom: true, group: 'Daily work' },
    { key: 'patients', label: 'Patients', to: '/patients/search', match: '/patients', icon: 'patients', bottom: true, group: 'Daily work' },
  ];
  if (roles.some((role) => ['facility_admin', 'cashier', 'supervisor'].includes(role)) || context.permissions.some((permission) => ['payment:receive', 'payment:waive', 'fee_item:manage'].includes(permission))) {
    items.push({ key: 'billing', label: 'Billing', to: '/billing', match: '/billing', icon: 'registers', bottom: context.role === 'cashier', group: 'Money' });
  }
  if (dailyWork) items.push(
    { key: 'encounters', label: 'Visits', to: '/encounters', match: '/encounters', icon: 'encounter', bottom: clinicalShortcut, group: 'Daily work' },
    { key: 'appointments', label: 'Appointments', to: '/appointments', match: '/appointments', icon: 'clock', bottom: frontDesk, group: 'Daily work' },
    { key: 'registers', label: 'Registers', to: '/registers', match: '/registers', icon: 'registers', group: 'Daily work' },
    ...(UNIT_QUEUE_VISIBLE && (clinical || admin || context.permissions.includes('handoff:update')) ? [{ key: 'units', label: 'Unit queue', to: '/units', match: '/units', icon: 'clock' as const, group: 'Daily work' as const }] : []),
  );
  if (dailyWork) items.push(
    { key: 'stock', label: 'Medicine & stock', to: '/stock', match: '/stock', icon: 'stock', group: 'Facility' },
    { key: 'month', label: 'Monthly reports', to: '/reports/month', match: '/reports', icon: 'month', group: 'Facility' },
  );
  if (roles.includes('facility_admin') || context.permissions.some((permission) => ['staff:manage', 'staff:permission', 'staff:deactivate', 'roster:assign', 'credential:read', 'practitioner:manage', 'staff_assignment:manage', 'service_session:manage'].includes(permission))) items.push({ key: 'staff', label: 'Staff & roster', to: '/admin/staff', match: '/admin/staff', icon: 'patients', group: 'Facility' });
  if (context.permissions.some((p)=>['unit:manage','location:manage','service:manage','staff_assignment:manage','staff:manage'].includes(p))) items.push({key:'facility',label:'Facility setup',to:'/facility',match:'/facility',icon:'referrals',group:'Facility'});
  if (hasAdminWorkspace(context)) items.push({ key: 'admin', label: 'Settings', to: '/admin', match: '/admin', icon: 'lock', group: 'Facility' });
  return items;
};

/** Longest match prevents Settings and Staff being selected together. */
export const activeNavigationKey = (items: readonly NavItem[], pathname: string): string | undefined =>
  items.filter((item) => pathname === item.match || pathname.startsWith(item.match + '/'))
    .sort((a, b) => b.match.length - a.match.length)[0]?.key;
