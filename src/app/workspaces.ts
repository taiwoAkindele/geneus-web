import type { AuthorizationContext, Permission, Role } from '@shared';
import { clinicalDocumentAccess } from '@shared';
import type { IconName } from '@/ui';
import { navigationFor } from './navigation';

export type WorkspaceId = 'front-desk' | 'clinical' | 'finance' | 'operations' | 'inventory' | 'reports' | 'administration';
export type WorkspaceContext = Pick<AuthorizationContext, 'role' | 'roles' | 'permissions'>;
export type WorkspaceLink = { key: string; label: string; description: string; to: string; icon: IconName };
export type Workspace = { id: WorkspaceId; label: string; description: string; icon: IconName; links: WorkspaceLink[] };

export const workspacePath = (id: WorkspaceId) => `/workspace/${id}`;
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
  const staffAccess = roleIn(context, 'facility_admin') || has(context, 'staff:manage', 'staff:permission', 'staff:deactivate');
  const devices = roleIn(context, 'facility_admin') || has(context, 'device:enroll', 'device:revoke');
  const inventory = roleIn(context, 'facility_admin', 'doctor', 'nurse', 'chew', 'supervisor') || has(context, 'stock_item:manage', 'stock_movement:create');
  const reports = roleIn(context, 'facility_admin', 'records_officer', 'doctor', 'nurse', 'chew', 'supervisor') || has(context, 'register_entry:create', 'register_definition:publish');
  const modules: Workspace[] = [
    { id: 'front-desk', label: 'Patients & Front Desk', description: 'Registration, appointments and arrivals', icon: 'patients', links: [
      link('patients', 'Patients', 'Find a patient and open their shared record.', '/patients/search', 'search'),
      ...(has(context, 'patient:create') ? [link('registration', 'Register patient', 'Create a patient record after checking for duplicates.', '/patients/new', 'plus')] : []),
      ...(appointments ? [link('appointments', 'Appointments & arrivals', 'Plan bookings and record attendance.', '/appointments', 'clock')] : []),
      ...(has(context, 'patient_identity:review', 'patient_identity:resolve') ? [link('identity', 'Identity review', 'Review potential duplicate patient identities.', '/patients/identity', 'patients')] : []),
    ] },
    { id: 'clinical', label: 'Clinical', description: 'Consultation, laboratory and pharmacy', icon: 'encounter', links: [
      ...(has(context, 'admission:manage') ? [link('admissions', 'Wards & admissions', 'Receive requests, allocate beds and manage inpatient stays.', '/admissions', 'patients')] : []),
      ...(keys.has('encounters') && (consultation || lab || pharmacy) ? [link('clinical-patients', 'Patients', 'View patient details, admissions and permitted medical history.', '/patients/search', 'patients')] : []),
      ...(keys.has('encounters') && lab ? [link('laboratory', 'Laboratory', 'Open the laboratory queue and record results.', '/encounters?queue=lab', 'laboratory')] : []),
      ...(keys.has('encounters') && consultation ? [link('results', 'Results ready', 'Review visits with laboratory results ready.', '/encounters?queue=results', 'registers')] : []),
      ...(keys.has('encounters') && pharmacy ? [link('pharmacy', 'Pharmacy', 'Open prescriptions waiting for dispensing.', '/encounters?queue=pharmacy', 'pharmacy')] : []),
      ...(consultation ? [link('referrals', 'Referrals', 'Send handovers and receive patients in this facility.', '/referrals/track', 'referrals')] : []),
      ...(keys.has('units') ? [link('handoffs', 'Handoffs & unit queue', 'Review incoming work and the next step of care.', '/units', 'referrals')] : []),
      ...(clinicalDocumentAccess(context)?[link('documents','Documents','Manage hospital files and review visit documents.','/documents','registers')]:[]),
    ] },
    { id: 'finance', label: 'Finance', description: 'Accounts, payments and fees', icon: 'finance', links: keys.has('billing') ? [
      link('accounts', 'Patient accounts', 'Find bills, review charges and receive payments.', '/billing?tab=collections', 'finance'),
      link('transfers', 'Transfer reconciliation', 'Match incoming transfers to the correct account.', '/billing?tab=transfers', 'referrals'),
      link('financial-reports', 'Payments & financial reports', 'Review collections and recorded receipts.', '/billing?tab=reports', 'month'),
      ...(has(context, 'fee_item:manage') || roleIn(context, 'facility_admin') ? [link('fees', 'Fees', 'Manage the prices attached to facility services.', '/billing/fees', 'registers'), link('receiving', 'Payment setup', 'Manage departments and receiving accounts.', '/billing/settings', 'settings')] : []),
    ] : [] },
    { id: 'operations', label: 'Operations', description: 'Services, teams and schedules', icon: 'calendar', links: [
      ...(has(context, 'service:manage') ? [link('investigations', 'Investigation catalogue', 'Configure available investigations and their fees.', '/investigations/catalogue', 'laboratory')] : []),
      ...(keys.has('facility') ? [link('facility', 'Facility setup', 'Manage services, accountable teams and locations.', '/facility', 'referrals')] : []),
      ...(keys.has('staff') ? [link('staff', 'Staff & roster', 'Manage people, assignments and planned shifts.', '/admin/staff', 'patients')] : []),
    ] },
    { id: 'inventory', label: 'Inventory', description: 'Medicines, supplies and stock', icon: 'stock', links: inventory && keys.has('stock') ? [link('stock', 'Medicine & stock', 'Review stock balances, movements and items needing attention.', '/stock', 'stock')] : [] },
    { id: 'reports', label: 'Registers & Reports', description: 'Programme records and reports', icon: 'month', links: reports ? [
      ...(keys.has('registers') ? [link('registers', 'Register books', 'Record and review entries in facility programme books.', '/registers', 'registers')] : []),
      ...(keys.has('month') ? [link('monthly', 'Monthly reports', 'Review recorded facility activity by month.', '/reports/month', 'month')] : []),
    ] : [] },
    { id: 'administration', label: 'Administration', description: 'Access, devices and settings', icon: 'settings', links: [
      ...(roleIn(context, 'facility_admin') ? [link('organization', 'Organization', 'Link independent facilities and request staff provisioning.', '/organization', 'referrals')] : []),
      ...(staffAccess ? [link('access', 'User access', 'Open staff profiles to manage sign-in duties and permissions.', '/admin/staff?workspace=administration', 'lock')] : []),
      ...(devices ? [link('devices', 'Facility devices', 'Enroll devices and review or revoke their access.', '/admin/devices', 'lock')] : []),
      ...(staffAccess || devices ? [link('settings', 'Administration settings', 'Manage account recovery and administrative settings.', '/admin', 'settings')] : []),
    ] },
  ];
  return modules.filter((workspace) => workspace.links.length > 0);
};

/** Shared patient and staff pages retain the relevant, permitted workspace. */
export const workspaceForLocation = (pathname: string, search: string, available: readonly Workspace[], preferred?: WorkspaceId): Workspace | undefined => {
  const find = (id?: string) => available.find((workspace) => workspace.id === id);
  if (pathname.startsWith('/workspace/')) return find(pathname.split('/')[2]);
  if (pathname === '/home' || pathname === '/sync') return undefined;
  const params = new URLSearchParams(search);
  if (pathname.startsWith('/patients')) return find(preferred === 'finance' || preferred === 'clinical' ? preferred : 'front-desk');
  if (pathname.startsWith('/admin/staff')) return find(params.get('workspace') === 'administration' || pathname === '/admin/staff/access' || preferred === 'administration' ? 'administration' : 'operations') ?? find('administration');
  if (pathname.startsWith('/referrals')) return find('clinical');
  if (pathname.startsWith('/investigations')) return find('operations');
  if (pathname.startsWith('/organization')) return find('administration');
  if (pathname.startsWith('/documents') || pathname.startsWith('/admissions') || pathname.startsWith('/encounters') || pathname.startsWith('/units') || pathname === '/clinical-reviews') return find('clinical');
  if (pathname.startsWith('/billing') || pathname === '/admin/fees') return find('finance');
  if (pathname.startsWith('/facility') || pathname === '/admin/units') return find('operations');
  if (pathname.startsWith('/stock')) return find('inventory');
  if (pathname.startsWith('/registers') || pathname.startsWith('/reports')) return find('reports');
  if (pathname.startsWith('/admin')) return find('administration');
  if (pathname.startsWith('/appointments')) return find(preferred === 'clinical' ? 'clinical' : 'front-desk');
  return undefined;
};

export const activeWorkspaceLink = (workspace: Workspace, pathname: string, search: string): string | undefined => {
  const current = new URLSearchParams(search);
  return [...workspace.links].sort((a, b) => b.to.split('?')[0].length - a.to.split('?')[0].length).find((item) => {
    const [path, query] = item.to.split('?');
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
