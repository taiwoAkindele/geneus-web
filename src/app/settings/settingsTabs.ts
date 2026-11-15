import type { AuthorizationContext } from '@shared';
import type { IconName } from '@/ui';

/**
 * Facility-wide settings, one tab per area. A tab shows only to people who may
 * use it; the server checks the same permissions on every save. Daily work
 * stays in its module, a module's own setup opens from that module's header
 * Settings menu (src/app/moduleSettings.ts), and Staff is its own module.
 */
/** `navigation: false`: reachable (e.g. from a Home card) but not listed in the sidebar for this person. */
export type SettingsTab = { key: string; label: string; description: string; to: string; icon: IconName; navigation?: false; sub?: { key: string; label: string; to: string }[] };
type Viewer = Pick<AuthorizationContext, 'role' | 'roles' | 'permissions'>;

const has = (context: Viewer, ...permissions: string[]) => permissions.some((p) => context.permissions.includes(p as never));
const isAdmin = (context: Viewer) => context.role === 'facility_admin' || Boolean(context.roles?.includes('facility_admin'));
/** Plans sign-in windows or service coverage for others (rather than only running intake). */
export const schedulingPlanner = (context: Viewer) => isAdmin(context) || has(context, 'roster:assign', 'service_session:manage', 'staff_assignment:manage', 'staff:manage');

export const settingsTabsFor = (context: Viewer): SettingsTab[] => [
  ...(isAdmin(context) || has(context, 'unit:manage', 'location:manage', 'service:manage', 'staff_assignment:manage') ? [{ key: 'facility', label: 'Facility', description: 'Time zone, services, departments, locations and financial links.', to: '/settings/facility', icon: 'referrals' as IconName }] : []),
  // Facility-wide workforce planning. Clinicians open walk-in intake from Coverage (via Home), so they may
  // reach it too, without a Settings entry in their sidebar.
  ...(schedulingPlanner(context) || has(context, 'service_session:operate') ? [{ key: 'scheduling', label: 'Staff scheduling & coverage', description: 'Sign-in windows and service coverage for the whole facility.', to: '/settings/scheduling', icon: 'clock' as IconName,
    ...(schedulingPlanner(context) ? {} : { navigation: false as const }) }] : []),
  ...(isAdmin(context) || has(context, 'device:enroll', 'device:revoke') ? [{ key: 'devices', label: 'Devices', description: 'Enrolled devices, their sync status and access.', to: '/settings/devices', icon: 'lock' as IconName }] : []),
  ...(isAdmin(context) ? [{ key: 'organization', label: 'Organization', description: 'Linked facilities, and staff access requests from them.', to: '/settings/organization', icon: 'referrals' as IconName }] : []),
  ...(isAdmin(context) || has(context, 'staff:manage') ? [{ key: 'account', label: 'Account & security', description: 'Administrator account recovery.', to: '/settings/account', icon: 'settings' as IconName }] : []),
];
