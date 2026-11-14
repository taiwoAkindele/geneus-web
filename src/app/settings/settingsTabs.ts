import type { AuthorizationContext } from '@shared';
import type { IconName } from '@/ui';

/**
 * Every facility setting lives under Settings, one tab per area. A tab shows
 * only to people who may use it; the server checks the same permissions on
 * every save. Daily work (accounts, insurance work, claims) stays in its module.
 */
export type SettingsTab = { key: string; label: string; description: string; to: string; icon: IconName; sub?: { key: string; label: string; to: string }[] };
type Viewer = Pick<AuthorizationContext, 'role' | 'roles' | 'permissions'>;

const has = (context: Viewer, ...permissions: string[]) => permissions.some((p) => context.permissions.includes(p as never));
const isAdmin = (context: Viewer) => context.role === 'facility_admin' || Boolean(context.roles?.includes('facility_admin'));

export const settingsTabsFor = (context: Viewer): SettingsTab[] => [
  ...(isAdmin(context) || has(context, 'unit:manage', 'location:manage', 'service:manage', 'staff_assignment:manage') ? [{ key: 'facility', label: 'Facility', description: 'Time zone, services, departments, locations and financial links.', to: '/settings/facility', icon: 'referrals' as IconName }] : []),
  ...(has(context, 'staff:manage', 'staff:permission', 'staff:deactivate', 'roster:assign') ? [{ key: 'staff', label: 'Staff & access', description: 'People, roles, permissions and planned shifts.', to: '/settings/staff', icon: 'patients' as IconName }] : []),
  ...(isAdmin(context) || has(context, 'device:enroll', 'device:revoke') ? [{ key: 'devices', label: 'Devices', description: 'Enrolled devices, their sync status and access.', to: '/settings/devices', icon: 'lock' as IconName }] : []),
  ...(isAdmin(context) || has(context, 'fee_item:manage') ? [{ key: 'billing', label: 'Billing', description: 'Fees, departments and receiving accounts.', to: '/settings/billing', icon: 'finance' as IconName,
    sub: [{ key: 'fees', label: 'Fees', to: '/settings/billing/fees' }, { key: 'payments', label: 'Payment setup', to: '/settings/billing/payments' }] }] : []),
  ...(has(context, 'insurance_contract:activate', 'insurance_contract:manage', 'insurance_contract:read') ? [{ key: 'insurance', label: 'Insurance', description: 'Setup and readiness, payers and contracts.', to: '/settings/insurance', icon: 'finance' as IconName,
    sub: [{ key: 'setup', label: 'Setup & readiness', to: '/settings/insurance/setup' }, { key: 'payers', label: 'Payers & contracts', to: '/settings/insurance/payers' }] }] : []),
  ...(has(context, 'service:manage', 'result_template:manage') ? [{ key: 'catalogue', label: 'Clinical catalogue', description: 'Investigations, result templates and their fees.', to: '/settings/catalogue', icon: 'laboratory' as IconName }] : []),
  ...(isAdmin(context) ? [{ key: 'organization', label: 'Organization', description: 'Linked facilities and staff provisioning.', to: '/settings/organization', icon: 'referrals' as IconName }] : []),
  ...(isAdmin(context) || has(context, 'staff:manage') ? [{ key: 'account', label: 'Account & security', description: 'Recovery email and staff email confirmations.', to: '/settings/account', icon: 'settings' as IconName }] : []),
];
