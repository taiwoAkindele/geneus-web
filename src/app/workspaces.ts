import type { AuthorizationContext, Permission, Role } from '@shared';
import { clinicalDocumentAccess } from '@shared';
import type { IconName } from '@/ui';
import { navigationFor } from './navigation';
import { insuranceBillingWork } from '@/data/insuranceSupport';
import { settingsTabsFor } from './settings/settingsTabs';

export type WorkspaceId = 'front-desk' | 'clinical' | 'finance' | 'inventory' | 'reports' | 'settings';
export type WorkspaceContext = Pick<AuthorizationContext, 'role' | 'roles' | 'permissions'> & Partial<Pick<AuthorizationContext, 'facilityId' | 'deviceId'>>;
/** `also` lists other pages that belong to this link, so it stays highlighted there. */
export type WorkspaceLink = { key: string; label: string; description: string; to: string; icon: IconName; also?: readonly string[] };
/** `start` opens the module on that page instead of its Overview, which the module then does not offer. */
export type Workspace = { id: WorkspaceId; label: string; description: string; icon: IconName; links: WorkspaceLink[]; start?: string };

export const workspacePath = (id: WorkspaceId) => `/workspace/${id}`;
/** Where entering a module lands: its start page, otherwise its first page. Modules have no Overview pages. */
export const moduleStart = (workspace: Pick<Workspace, 'id' | 'start' | 'links'>) => workspace.start ?? workspace.links[0]?.to ?? '/home';
const has = (context: WorkspaceContext, ...permissions: Permission[]) => permissions.some((permission) => context.permissions.includes(permission));
const roleIn = (context: WorkspaceContext, ...roles: Role[]) => (context.roles ?? [context.role]).some((role) => roles.includes(role));

/** One navigation catalogue; it does not grant read access or authority to perform care. */
export const workspacesFor = (context: WorkspaceContext): Workspace[] => {
  const keys = new Set(navigationFor(context).map((item) => item.key));
  const link = (key: string, label: string, description: string, to: string, icon: IconName): WorkspaceLink => ({ key, label, description, to, icon });
  const consultation = roleIn(context, 'doctor', 'nurse', 'chew', 'supervisor', 'facility_admin') || has(context, 'clinical:assess', 'clinical:diagnose');
  const lab = consultation || roleIn(context, 'laboratory_staff') || has(context, 'clinical:perform_test', 'clinical:record_result');
  const pharmacy = consultation || roleIn(context, 'pharmacy_staff') || has(context, 'clinical:dispense');
  const appointments = roleIn(context, 'records_officer', 'doctor', 'nurse', 'chew', 'supervisor', 'facility_admin') || has(context, 'appointment:create', 'appointment:update');
  const inventory = roleIn(context, 'facility_admin', 'doctor', 'nurse', 'chew', 'supervisor') || has(context, 'stock_item:manage', 'stock_movement:create');
  const reports = roleIn(context, 'facility_admin', 'records_officer', 'doctor', 'nurse', 'chew', 'supervisor') || has(context, 'register_entry:create', 'register_definition:publish');
  const modules: Workspace[] = [
    // Front desk work starts at the patient list; its Overview only repeated the menu (GEN-6).
    { id: 'front-desk', label: 'Front Desk', description: 'Registration, appointments and arrivals', icon: 'patients', start: '/patients/search', links: [
      // Registration starts from the patient list's Register patient button, so its pages belong to Patients.
      { ...link('patients', 'Patients', 'Find a patient and open their shared record.', '/patients/search', 'search'), also: ['/patients/new', '/patients/duplicate'] },
      ...(appointments ? [link('appointments', 'Appointments & arrivals', 'Plan bookings and record attendance.', '/appointments', 'clock')] : []),
      ...(has(context, 'patient_identity:review', 'patient_identity:resolve') ? [link('identity', 'Identity review', 'Review potential duplicate patient identities.', '/patients/identity', 'patients')] : []),
    ] },
    { id: 'clinical', label: 'Clinical', description: 'Consultation, laboratory and pharmacy', icon: 'encounter', links: [
      // In order of use. Results reach the visit and alert the ordering clinician, so there is no results page;
      // Handoffs & unit queue (/units) stays reachable by address but is hidden until a facility needs it.
      ...(keys.has('encounters') && (consultation || lab || pharmacy) ? [{ ...link('clinical-patients', 'Patients', 'Find a patient and open their chart.', '/patients/search', 'patients'), also: ['/clinical/patients'] }] : []),
      ...(has(context, 'admission:manage') ? [link('admissions', 'Wards & admissions', 'Receive requests, allocate beds and manage inpatient stays.', '/admissions', 'patients')] : []),
      ...(keys.has('encounters') && lab ? [link('laboratory', 'Laboratory', 'Open and completed test requests.', '/laboratory', 'laboratory')] : []),
      ...(keys.has('encounters') && pharmacy ? [link('pharmacy', 'Pharmacy', 'Open and completed prescriptions.', '/pharmacy', 'pharmacy')] : []),
      ...(consultation ? [link('referrals', 'Referrals', 'Send handovers and receive patients in this facility.', '/referrals/track', 'referrals')] : []),
      ...(clinicalDocumentAccess(context)?[link('documents','Documents','Manage hospital files and review visit documents.','/documents','registers')]:[]),
      // Insured services the payer is asked to pay for need a record that they were done; clinicians record it.
      ...(insuranceBillingWork(context) && has(context, 'encounter:record') ? [link('service-completion', 'Service completion', 'Record insured services as done or not done.', '/clinical/service-completion', 'encounter')] : []),
    ] },
    { id: 'finance', label: 'Finance', description: 'Accounts, payments and fees', icon: 'finance', links: [...(keys.has('billing') ? [
      link('accounts', 'Patient accounts', 'Find bills, review charges and receive payments.', '/billing?tab=collections', 'finance'),
      link('transfers', 'Transfer reconciliation', 'Match incoming transfers to the correct account.', '/billing?tab=transfers', 'referrals'),
      link('financial-reports', 'Payments & financial reports', 'Review collections and recorded receipts.', '/billing?tab=reports', 'month'),
    ] : []),
      // Daily insurance work appears once billing is active; setting insurance up lives under Settings.
      ...(insuranceBillingWork(context) && has(context, 'coverage:confirm', 'insurance_contract:read', 'insurance_contract:manage', 'insurance_contract:activate', 'payment:refund') ? [link('insurance', 'Insurance work', 'Confirm insurance splits, resolve undecided cover and refund credits.', '/insurance', 'finance')] : []),
      ...(insuranceBillingWork(context) && has(context, 'coverage:confirm') ? [link('claims', 'Claims', 'Prepare, export and record claims to payers.', '/insurance/claims', 'month')] : []),
      ...(insuranceBillingWork(context) && has(context, 'insurance_remittance:record') ? [link('payer-payments', 'Payer payments', 'Record what payers paid and follow up what they still owe.', '/insurance/payments', 'finance')] : []),
    ] },
    { id: 'inventory', label: 'Inventory', description: 'Medicines, supplies and stock', icon: 'stock', links: inventory && keys.has('stock') ? [link('stock', 'Medicine & stock', 'Review stock balances, movements and items needing attention.', '/stock', 'stock')] : [] },
    { id: 'reports', label: 'Registers & Reports', description: 'Programme records and reports', icon: 'month', links: reports ? [
      ...(keys.has('registers') ? [link('registers', 'Register books', 'Record and review entries in facility programme books.', '/registers', 'registers')] : []),
      ...(keys.has('month') ? [link('monthly', 'Monthly reports', 'Review recorded facility activity by month.', '/reports/month', 'month')] : []),
    ] : [] },
    // Every facility setting, one page per area: the same tabs as the Settings page.
    { id: 'settings', label: 'Settings', description: 'Facility, staff, devices, billing and insurance setup', icon: 'settings', links: settingsTabsFor(context).map((tab) => ({
      ...link(tab.key === 'devices' ? 'devices' : `settings-${tab.key}`, tab.label, tab.description, tab.to, tab.icon),
      ...(tab.key === 'staff' ? { also: ['/admin/staff'] } : tab.key === 'facility' ? { also: ['/facility'] } : tab.key === 'catalogue' ? { also: ['/investigations'] } : {}),
    })) },
  ];
  return modules.filter((workspace) => workspace.links.length > 0);
};

/** Shared patient and staff pages retain the relevant, permitted workspace. */
export const workspaceForLocation = (pathname: string, _search: string, available: readonly Workspace[], preferred?: WorkspaceId): Workspace | undefined => {
  const find = (id?: string) => available.find((workspace) => workspace.id === id);
  if (pathname.startsWith('/workspace/')) return find(pathname.split('/')[2]);
  if (pathname === '/home' || pathname === '/sync') return undefined;
  if (pathname.startsWith('/patients')) return find(preferred === 'finance' || preferred === 'clinical' ? preferred : 'front-desk');
  if (pathname.startsWith('/settings') || pathname.startsWith('/admin')) return find('settings');
  if (pathname.startsWith('/referrals')) return find('clinical');
  if (pathname.startsWith('/investigations') || pathname.startsWith('/organization') || pathname.startsWith('/facility')) return find('settings');
  if (pathname.startsWith('/documents') || pathname.startsWith('/admissions') || pathname.startsWith('/encounters') || pathname.startsWith('/clinical/') || pathname === '/laboratory' || pathname === '/pharmacy' || pathname.startsWith('/laboratory/') || pathname.startsWith('/pharmacy/') || pathname.startsWith('/units') || pathname === '/clinical-reviews') return find('clinical');
  if (pathname.startsWith('/billing') || pathname === '/admin/fees') return find('finance');
  if (pathname.startsWith('/stock')) return find('inventory');
  if (pathname.startsWith('/registers') || pathname.startsWith('/reports')) return find('reports');
  if (pathname.startsWith('/appointments')) return find(preferred === 'clinical' ? 'clinical' : 'front-desk');
  return undefined;
};

export const activeWorkspaceLink = (workspace: Workspace, pathname: string, search: string): string | undefined => {
  const current = new URLSearchParams(search);
  return [...workspace.links].sort((a, b) => b.to.split('?')[0].length - a.to.split('?')[0].length).find((item) => {
    const [path, query] = item.to.split('?');
    if (item.also?.some((page) => pathname === page || pathname.startsWith(page + '/'))) return true;
    if (pathname !== path && !pathname.startsWith(path + '/')) return false;
    return [...new URLSearchParams(query)].every(([key, value]) => (current.get(key) ?? (key === 'queue' ? 'all' : key === 'tab' ? 'collections' : '')) === value);
  })?.key;
};

// Store a module ID only, scoped to the staff member and facility; never a patient or draft.
const preferenceKey = (facilityId: string, userId: string) => `geneus.workspace:${JSON.stringify([facilityId, userId])}`;
export const readLastWorkspace = (facilityId: string, userId: string): WorkspaceId | undefined => {
  try { return localStorage.getItem(preferenceKey(facilityId, userId)) as WorkspaceId | null ?? undefined; }
  catch { return undefined; }
};
export const rememberWorkspace = (facilityId: string, userId: string, id: WorkspaceId): void => {
  try { localStorage.setItem(preferenceKey(facilityId, userId), id); }
  catch { /* Navigation works when browser preference storage is unavailable. */ }
};
