import { canReadPatientChart, type AuthorizationContext } from '@shared';

/** Clinical staff open patients at their chart; front desk and cashiers at their details. */
export const opensChartFirst = (context: Pick<AuthorizationContext, 'role' | 'permissions'>): boolean =>
  canReadPatientChart(context) && !['records_officer', 'cashier'].includes(context.role);

export const PATIENT_TABS ={ now: 'Now', history: 'History', clinical: 'Clinical record', details: 'Details' } as const;
export type PatientTab = keyof typeof PATIENT_TABS;

/** What the History tab lists. `chart` is the all-visit medical chart (the former Overview). */
export const HISTORY_VIEWS = { visits: 'Visits', stays: 'Hospital stays', appointments: 'Appointments', documents: 'Documents', chart: 'Chart across visits' } as const;
export type HistoryView = keyof typeof HISTORY_VIEWS;

/** Former tab names, kept so bookmarks, notifications and older links still open the right place. */
export type LegacyPatientTab = 'overview' | 'ward' | 'visits' | 'appointments' | 'documents';
const LEGACY: Record<LegacyPatientTab, { tab: PatientTab; show?: HistoryView }> = {
  overview: { tab: 'now' },
  // A current stay opens on Now; a departed one stays readable under Hospital stays (PatientProfile decides).
  ward: { tab: 'history', show: 'stays' },
  visits: { tab: 'history', show: 'visits' },
  appointments: { tab: 'history', show: 'appointments' },
  documents: { tab: 'history', show: 'documents' },
};

/** Reads a `tab` value, including a former one; undefined when absent or unknown. */
export const resolvePatientTab = (value: string | null): { tab: PatientTab; show?: HistoryView } | undefined => {
  if (!value) return undefined;
  if (value in PATIENT_TABS) return { tab: value as PatientTab };
  return LEGACY[value as LegacyPatientTab];
};

export const patientChartPath = (patientId: string, tab: PatientTab | LegacyPatientTab = 'now', extra: Record<string, string> = {}) => {
  const resolved = resolvePatientTab(tab) ?? { tab: 'now' as const };
  return `/patients/profile?${new URLSearchParams({ patient: patientId, tab: resolved.tab, ...(resolved.show ? { show: resolved.show } : {}), ...extra })}`;
};

export const visitRecordPath = (patientId: string, encounterId: string, returnTo?: string, appointmentId?: string) =>
  `/encounters/record?${new URLSearchParams({ patient: patientId, ...(encounterId ? { visit: encounterId } : {}), ...(appointmentId ? { appointment: appointmentId } : {}), ...(returnTo ? { returnTo } : {}) })}`;
