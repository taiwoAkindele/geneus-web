import type { AuthorizationContext, Permission, Role } from '@shared';

/**
 * Configuration that belongs to one module (its catalogue, price list, payers)
 * opens from that module's header Settings menu, on pages that keep the module
 * selected. Global Settings keeps facility-wide configuration only.
 *
 * Each page shows only to people who may use it; repositories and the server
 * still check every save. `tab: false` marks a menu shortcut into a section of
 * another page (for example a tab of Result templates), not a page of its own.
 */
export type ModuleSettingsId = 'laboratory' | 'insurance' | 'billing';
export type ModuleSettingsPage = { key: string; label: string; to: string; tab: boolean };
export type ModuleSettings = { id: ModuleSettingsId; label: string; home: string; base: string; pages: ModuleSettingsPage[] };
type Viewer = Pick<AuthorizationContext, 'role' | 'roles' | 'permissions'>;

const has = (context: Viewer, ...permissions: Permission[]) => permissions.some((permission) => context.permissions.includes(permission));
const roleIn = (context: Viewer, ...roles: Role[]) => (context.roles ?? [context.role]).some((role) => roles.includes(role));
const page = (key: string, label: string, to: string, allowed: boolean, tab = true): ModuleSettingsPage[] => allowed ? [{ key, label, to, tab }] : [];

export const moduleSettingsFor = (id: ModuleSettingsId, context: Viewer): ModuleSettings => {
  if (id === 'laboratory') {
    const templates = has(context, 'result_template:manage');
    return { id, label: 'Laboratory', home: '/laboratory', base: '/laboratory/settings', pages: [
      ...page('tests', 'Tests', '/laboratory/settings/tests', has(context, 'service:manage', 'result_template:manage')),
      ...page('templates', 'Result templates', '/laboratory/settings/templates', templates),
      ...page('parts', 'Result parts', '/laboratory/settings/templates?tab=parts', templates, false),
      ...page('answers', 'Answer lists', '/laboratory/settings/templates?tab=answers', templates, false),
    ] };
  }
  if (id === 'insurance') return { id, label: 'Insurance', home: '/insurance', base: '/insurance/settings', pages: [
    ...page('setup', 'Setup & readiness', '/insurance/settings/setup', has(context, 'insurance_contract:activate', 'insurance_contract:manage')),
    ...page('payers', 'Payers & contracts', '/insurance/settings/payers', has(context, 'insurance_contract:read', 'insurance_contract:manage', 'insurance_contract:activate')),
  ] };
  // Everyone who works in Billing may read the price list; only fee managers change it.
  const billing = roleIn(context, 'cashier', 'facility_admin', 'supervisor') || has(context, 'fee_item:manage', 'payment:receive', 'payment:waive');
  return { id, label: 'Billing', home: '/billing', base: '/billing/settings', pages: [
    ...page('fees', 'Fees', '/billing/settings/fees', billing),
    ...page('accounts', 'Departments & accounts', '/billing/settings/payments', roleIn(context, 'facility_admin') || has(context, 'fee_item:manage')),
  ] };
};

/** The settings page a path belongs to, ignoring any query (a tab inside that page). */
export const activeSettingsPage = (settings: ModuleSettings, pathname: string): ModuleSettingsPage | undefined =>
  settings.pages.filter((p) => p.tab).find((p) => pathname === p.to || pathname.startsWith(p.to + '/'));
