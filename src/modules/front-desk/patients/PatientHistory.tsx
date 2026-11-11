import type { ReactNode } from 'react';
import type { ClinicalKind, Patient } from '@shared';
import { ChoiceChip } from '@/ui';
import { calendarDate } from '@/lib/calendarDate';
import type { PatientClinicalRecord } from '@/data/repos/clinical';
import type { BookedAppointment } from '@/modules/front-desk/appointments';
import type { EncounterSummary } from '@/modules/clinical/encounter';
import { VisitTable, type VisitAction } from '@/modules/clinical/encounter/VisitTable';
import { PatientDocuments } from '@/modules/clinical/documents/PatientDocuments';
import { ClinicalDocumentsAccess } from '@/modules/clinical/documents/ClinicalDocumentsAccess';
import { WardCareWorkspace } from '@/modules/clinical/inpatient/WardCareWorkspace';
import { MedicalChart } from './MedicalChart';
import { PatientAppointments } from './PatientAppointments';
import { PatientIdentityPanel } from './PatientIdentityPanel';
import { HISTORY_VIEWS, type HistoryView } from './patientRoutes';

export const HISTORY_PERIODS = { all: 'All dates', today: 'Today', '30d': 'Last 30 days' } as const;
export type HistoryPeriod = keyof typeof HISTORY_PERIODS;

/** Whether an ISO time falls in the chosen period, by the device's local calendar date. */
export const inPeriod = (at: string, period: HistoryPeriod, now = new Date()): boolean => {
  if (period === 'all') return true;
  const day = calendarDate(at), today = calendarDate(now);
  if (period === 'today') return day === today;
  const from = new Date(now); from.setDate(from.getDate() - 29);
  return day >= calendarDate(from) && day <= today;
};

type Props = {
  view: HistoryView; period: HistoryPeriod; onView: (view: HistoryView) => void; onPeriod: (period: HistoryPeriod) => void;
  views: HistoryView[]; patient: Patient; patientId: string; chart?: PatientClinicalRecord; chartUnavailable?: ReactNode;
  history: EncounterSummary[]; appointments: BookedAppointment[]; appointmentsLoading: boolean; appointmentsError?: Error; onReloadAppointments: () => void;
  canRecord: boolean; canBook: boolean; onBook: () => void; onStartAppointment: (appointment: BookedAppointment) => void;
  onVisit: (id: string, continueVisit?: boolean) => void; onVisitAction: (visit: EncounterSummary, action: VisitAction) => void; onClinical: (kind: ClinicalKind) => void;
};

/**
 * Everything that has happened to the patient, in one place: visits,
 * appointments, documents and the chart across all visits. The period filter
 * narrows visits and appointments; documents and the chart keep their own order.
 */
export const PatientHistory = ({ view, period, onView, onPeriod, views, patient, patientId, chart, chartUnavailable, history, appointments, appointmentsLoading, appointmentsError, onReloadAppointments, canRecord, canBook, onBook, onStartAppointment, onVisit, onVisitAction, onClinical }: Props) => {
  const dated = view === 'visits' || view === 'appointments';
  const visits = history.filter((visit) => inPeriod(visit.openedOn, period));
  const bookings = appointments.filter((appointment) => inPeriod(appointment.at, period));
  return <div>
    <div className="mb-5"><h2 className="text-[26px] font-extrabold">History</h2><p className="mt-1 text-sm text-ink-soft">Earlier care, bookings and documents for this patient. Saved records on this device.</p></div>
    <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3">
      <div role="group" aria-label="Show" className="flex flex-wrap gap-2">{views.map((option) => <ChoiceChip key={option} selected={view === option} aria-pressed={view === option} onClick={() => onView(option)}>{HISTORY_VIEWS[option]}</ChoiceChip>)}</div>
      {dated ? <div role="group" aria-label="Period" className="flex flex-wrap gap-2">{(Object.keys(HISTORY_PERIODS) as HistoryPeriod[]).map((option) => <ChoiceChip key={option} selected={period === option} aria-pressed={period === option} onClick={() => onPeriod(option)}>{HISTORY_PERIODS[option]}</ChoiceChip>)}</div> : null}
    </div>
    {view === 'visits' ? chart ? <>{visits.length ? <VisitTable visits={visits} canRecord={canRecord} onAction={onVisitAction} /> : <p className="rounded-field border border-dashed border-outline p-6 text-sm text-ink-soft">{history.length ? `No visits in ${HISTORY_PERIODS[period].toLowerCase()}.` : 'No visits recorded for this patient on this device.'}</p>}</> : chartUnavailable : null}
    {view === 'stays' ? <WardCareWorkspace patientId={patientId} /> : null}
    {view === 'appointments' ? <PatientAppointments appointments={bookings} history={history} loading={appointmentsLoading} error={appointmentsError} onReload={onReloadAppointments} canBook={canBook} canRecord={canRecord} onBook={onBook} onStart={onStartAppointment} onVisit={onVisit} /> : null}
    {view === 'documents' ? <ClinicalDocumentsAccess><PatientDocuments patient={patient} encounters={chart?.encounters ?? []} /></ClinicalDocumentsAccess> : null}
    {view === 'chart' ? chart ? <><PatientIdentityPanel patientId={patientId} /><MedicalChart data={chart} appointments={appointments} appointmentsUnavailable={appointmentsLoading || Boolean(appointmentsError)} onClinical={onClinical} onVisit={onVisit} onAppointments={() => onView('appointments')} /></> : chartUnavailable : null}
  </div>;
};
