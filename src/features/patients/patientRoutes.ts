export const PATIENT_TABS = { overview: 'Overview', visits: 'Visits', clinical: 'Clinical record', documents:'Documents', appointments: 'Appointments', details: 'Personal details' } as const;
export type PatientTab = keyof typeof PATIENT_TABS;

export const patientChartPath = (patientId: string, tab: PatientTab = 'overview', extra: Record<string, string> = {}) =>
  `/patients/profile?${new URLSearchParams({ patient: patientId, tab, ...extra })}`;

export const visitRecordPath = (patientId: string, encounterId: string, returnTo?: string, appointmentId?: string) =>
  `/encounters/record?${new URLSearchParams({ patient: patientId, ...(encounterId ? { visit: encounterId } : {}), ...(appointmentId ? { appointment: appointmentId } : {}), ...(returnTo ? { returnTo } : {}) })}`;
