import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CheckInCoverPrompt } from '@/modules/insurance/CoverCard';
import { ClinicalKind, patientSexLabel, INPATIENT_STATUS, clinicalDocumentAccess, canReadPatientChart, type AuthorizationContext } from '@shared';
import { useInpatient } from '@/modules/clinical/inpatient/useInpatient';
import { withAdmission } from '@/modules/clinical/inpatient/summary';
import { ActionMenu, Button, SectionTabs } from '@/ui';
import { useAuthorizationContext, useSession } from '@/session';
import { useLiveQuery } from '@/data';
import { patientClinicalRecord } from '@/data/repos/clinical';
import { listOpenRejections } from '@/data/repos/syncRejections';
import { PatientCard } from './PatientCard';
import { AllergyAlert } from '@/modules/clinical/clinical';
import { BookAppointmentSheet, useAppointments, type AppointmentPatient, type BookedAppointment } from '@/modules/front-desk/appointments';
import { summariseEncounter, type EncounterSummary } from '@/modules/clinical/encounter';
import type { VisitAction } from '@/modules/clinical/encounter/VisitTable';
import { currentAge, usePatient } from '@/modules/front-desk/search';
import { ClinicalRecordManager } from './ClinicalRecordManager';
import { PersonalDetails, PersonalDetailsEditor } from './PersonalDetails';
import { VisitRecord } from './VisitRecord';
import { PatientNow } from './PatientNow';
import { HISTORY_PERIODS, PatientHistory, type HistoryPeriod } from './PatientHistory';
import { PATIENT_TABS, opensChartFirst, resolvePatientTab, visitRecordPath, type HistoryView, type PatientTab } from './patientRoutes';

const Message = ({ children }: { children: React.ReactNode }) => <div className="p-6 text-sm text-ink-soft">{children}</div>;

/** Front desk and cashiers open a patient for their details; everyone who can read the chart opens Now. */
const defaultTab = (context: Pick<AuthorizationContext, 'role' | 'permissions'>): PatientTab => opensChartFirst(context) ? 'now' : 'details';

export const PatientProfile = ({ patientId }: { patientId?: string }) => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const context = useAuthorizationContext();
  const { facility } = useSession();
  const canRecord = context.permissions.includes('encounter:record');
  const canEdit = context.permissions.includes('patient:update');
  const canBook = context.permissions.includes('appointment:create');
  const canChart = canReadPatientChart(context);
  const patient = usePatient(patientId);
  const chart = useLiveQuery(useCallback(() => patientId ? patientClinicalRecord(patientId,context) : Promise.resolve(undefined), [patientId,context.userId,context.permissions.join('|')]), ['clinical_event', 'encounter', 'encounter_entry', 'staff', 'patient', 'patient_identity_event']);
  const rejections = useLiveQuery(listOpenRejections);
  const admissions = useInpatient();
  const bookings = useAppointments();
  const [booking, setBooking] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const history = useMemo(() => chart.data ? chart.data.encounters.filter((encounter) => !encounter.inpatientContext).map((encounter) => withAdmission(summariseEncounter(encounter, chart.data!.entries.filter((entry) => entry.encounterId === encounter.id)), admissions.data)).sort((a, b) => b.openedOn.localeCompare(a.openedOn)) : [], [chart.data, admissions.data]);
  const currentAdmission = admissions.data?.active.find((event) => history.some((visit) => visit.id === event.encounterId));
  const admissionParam = params.get('admission');
  const hasStays = Boolean(admissionParam) || history.some((visit) => visit.careType === 'inpatient' || visit.careType === 'past_inpatient');
  // Tabs this person can use. Without chart access only details and bookings are offered.
  const tabs: PatientTab[] = canChart ? ['now', 'history', 'clinical', 'details'] : ['history', 'details'];
  const views: HistoryView[] = canChart ? ['visits', ...(hasStays ? ['stays' as const] : []), 'appointments', ...(clinicalDocumentAccess(context) ? ['documents' as const] : []), 'chart'] : ['appointments'];
  const resolved = resolvePatientTab(params.get('tab'));
  const showValue = params.get('show') ?? resolved?.show;
  const show: HistoryView = showValue && views.includes(showValue as HistoryView) ? showValue as HistoryView : views[0];
  const requested: PatientTab = resolved && tabs.includes(resolved.tab) ? resolved.tab : defaultTab(context);
  // A link to the current stay opens it on Now; a departed stay is read under Hospital stays.
  const tab: PatientTab = requested === 'history' && show === 'stays' && currentAdmission && (!admissionParam || admissionParam === currentAdmission.admissionId) && tabs.includes('now') ? 'now' : requested;
  const periodValue = params.get('period');
  const period: HistoryPeriod = periodValue && periodValue in HISTORY_PERIODS ? periodValue as HistoryPeriod : 'all';
  const categoryValue = params.get('category') ?? 'problem';
  const kind = ClinicalKind.safeParse(categoryValue).success ? categoryValue as ClinicalKind : 'problem';
  useEffect(() => { document.title = PATIENT_TABS[tab] + ' · Patient record · Geneus Health'; }, [tab]);
  useEffect(() => { const heading = document.querySelector<HTMLElement>('#patient-section-heading h2'); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); } }, [tab, show, chart.loading]);

  if (!patientId) return <Message>No patient selected. <Button variant="ghost" onClick={() => navigate('/patients/search')}>Patients</Button></Message>;
  if (patient.loading) return <Message>Opening the patient record…</Message>;
  if (patient.error) return <Message>The record could not be read. <Button variant="ghost" onClick={patient.reload}>Try again</Button></Message>;
  if (!patient.data) return <Message>This patient is not on this device. <Button variant="ghost" onClick={() => navigate('/patients/search')}>Patients</Button></Message>;
  const record = patient.data;
  const appointments = bookings.forPatient(patientId);
  const openVisits = history.filter((visit) => visit.status === 'Open');
  const active = openVisits[0];
  const selected = chart.data?.encounters.find((encounter) => encounter.id === params.get('visit'));
  const selectedSummary = history.find((visit) => visit.id === selected?.id);
  const reading = tab === 'history' && show === 'visits' && Boolean(params.get('visit'));
  const currentParams = () => { const next = new URLSearchParams(params); next.set('patient', patientId); next.set('tab', tab); return next; };
  const returnPath = '/patients/profile?' + currentParams();
  const changeTab = (value: PatientTab, category?: ClinicalKind) => setParams(() => {
    const next = currentParams(); next.set('tab', value); ['visit', 'panel', 'visitSection', 'booking', 'show', 'period'].forEach((key) => next.delete(key)); if (category) next.set('category', category); return next;
  });
  const showHistory = (view: HistoryView) => setParams(() => {
    const next = currentParams(); next.set('tab', 'history'); next.set('show', view); ['panel', 'visitSection', 'booking'].forEach((key) => next.delete(key)); if (view !== 'documents') next.delete('visit'); if (view !== 'stays') next.delete('admission'); return next;
  });
  const setPeriod = (value: HistoryPeriod) => setParams(() => { const next = currentParams(); if (value === 'all') next.delete('period'); else next.set('period', value); return next; }, { replace: true });
  const onClinical = (category: ClinicalKind) => changeTab('clinical', category);
  const viewVisit = (id: string, continueVisit = false) => {
    const visit = history.find((candidate) => candidate.id === id);
    if (continueVisit && canRecord && visit?.status === 'Open') navigate(visitRecordPath(visit.patientId, visit.id, returnPath));
    else setParams(() => { const next = currentParams(); next.set('tab', 'history'); next.set('show', 'visits'); next.set('visit', id); ['panel', 'visitSection', 'booking'].forEach((key) => next.delete(key)); return next; });
  };
  const visitAction = (visit: EncounterSummary, action: VisitAction) => {
    if (action === 'continue') return viewVisit(visit.id, true);
    setParams(() => { const next = currentParams(); next.set('tab', 'history'); next.set('show', 'visits'); next.set('visit', visit.id); next.delete('visitSection'); next.delete('booking'); if (['print', 'activity', 'amend'].includes(action)) next.set('panel', action); else next.delete('panel'); return next; });
  };
  // One primary action: several open visits are chosen between on Now; an inpatient's care is on Now.
  const start = () => openVisits.length > 1 ? changeTab('now') : active ? viewVisit(active.id, canRecord) : navigate(visitRecordPath(patientId, '', returnPath));
  const startAppointment = (appointment: BookedAppointment) => navigate(visitRecordPath(appointment.patient.id, appointment.encounterId ?? '', returnPath, appointment.id));
  const reference: AppointmentPatient = { id: record.patientId, name: record.fullName, initials: record.fullName.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join(''), allergy: 'Review recorded allergies before care' };
  const canBill = context.permissions.some((permission) => ['payment:receive', 'payment:waive', 'fee_item:manage'].includes(permission));
  const actions = context.permissions.includes('handoff:create') ? [{ label: 'Send to another unit', onSelect: () => navigate('/patients/send-to-unit', { state: { patientId: active?.patientId ?? patientId, encounterId: active?.id } }) }] : [];
  const relatedIds = new Set(chart.data?.patients.map((item) => item.patientId) ?? [patientId]);
  const needsAttention = rejections.data?.some((rejection) => relatedIds.has(String(rejection.refusedRecord?.patientId ?? '')) || rejection.entityId === patientId || history.some((visit) => visit.id === rejection.entityId) || chart.data?.entries.some((entry) => entry.id === rejection.entityId));
  const stayPlace = currentAdmission && admissions.data ? [admissions.data.locations.find((location) => location.id === currentAdmission.wardId)?.name, admissions.data.locations.find((location) => location.id === currentAdmission.bedId)?.name].filter(Boolean).join(' · ') || 'Awaiting bed' : '';
  const admissionCard = currentAdmission && admissions.data ? <section aria-label="Current inpatient stay" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-field border border-outline-soft bg-brand-wash p-4"><div><h3 className="font-bold">Inpatient · {INPATIENT_STATUS[currentAdmission.action]}</h3><p className="mt-1">{stayPlace} · {admissions.data.units.find((unit) => unit.id === currentAdmission.receivingUnitId)?.name ?? 'Receiving team'}</p>{admissions.data.pending.has(currentAdmission.id) ? <p className="mt-2 text-sm text-amber-text">Pending server confirmation</p> : null}</div>{context.permissions.includes('admission:manage') ? <Link className="inline-flex min-h-[44px] items-center font-bold text-brand underline" to={'/admissions?' + new URLSearchParams({ tab: 'inpatients', patient: currentAdmission.patientId })}>Manage bed &amp; stay</Link> : null}</section> : undefined;
  const chartUnavailable = chart.loading ? <p role="status">Reading the medical chart…</p> : <div role="alert"><p>The clinical record could not be read.</p><Button variant="ghost" onClick={chart.reload}>Try again</Button></div>;

  return <div className="min-h-screen bg-white px-4 pb-8 pt-4 md:px-8">
    <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft"><button type="button" className="min-h-[32px] font-semibold text-brand" onClick={() => navigate(params.get('from')?.startsWith('/patients/search?') ? params.get('from')! : '/patients/search')}>Patients</button></nav>
    {record.identityStatus === 'provisional' ? <section className="my-3 space-y-2 rounded-field bg-amber-bg p-4 text-sm text-amber-text" aria-label="Provisional patient identity"><h2 className="font-bold">Identity not yet known</h2><p>This is a provisional record. Confirm the patient ID before care. Add identity when reliable information becomes available.</p>{canEdit ? <Button variant="outlined" fullWidth={false} onClick={() => setEditing(true)}>Identify patient</Button> : null}{context.permissions.includes('patient_identity:review') ? <Button variant="ghost" fullWidth={false} onClick={() => navigate(`/patients/identity?other=${encodeURIComponent(record.patientId)}`)}>Review an existing record</Button> : null}</section> : null}
    <header className="border-b border-outline-soft pb-2">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h1 className="break-words text-[28px] font-extrabold tracking-tight">{record.fullName}</h1><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft"><span className="break-all font-mono">{record.patientId}</span><span>{currentAge(record) === undefined ? 'Age not recorded' : String(currentAge(record)) + ' years'} · {patientSexLabel(record.sex)}</span>{currentAdmission ? <span className="font-semibold text-brand">Inpatient · {stayPlace}</span> : null}</div></div>
        <div className="flex flex-wrap gap-2">{currentAdmission ? (tab !== 'now' && canChart ? <Button fullWidth={false} onClick={() => changeTab('now')}>Open ward care</Button> : null) : !reading || selectedSummary?.status === 'Open' ? active ? <Button fullWidth={false} onClick={start}>{openVisits.length > 1 ? 'Choose open visit' : canRecord ? 'Continue visit' : 'View visit'}</Button> : canRecord ? <Button fullWidth={false} disabled={chart.loading || Boolean(chart.error) || !chart.data || admissions.loading || Boolean(admissions.error)} onClick={start}>Start visit</Button> : null : null}{canBook && !reading ? <Button variant="outlined" fullWidth={false} onClick={() => setBooking(true)}>Book appointment</Button> : null}<Button variant="outlined" fullWidth={false} onClick={() => setCardOpen(true)}>Print patient card</Button>{canBill ? <Button variant="outlined" fullWidth={false} onClick={() => navigate('/billing?patient=' + encodeURIComponent(patientId))}>Billing account</Button> : null}{actions.length ? <ActionMenu label="More actions" actions={actions} /> : null}</div>
      </div>
      <div className="mt-4"><AllergyAlert patientId={record.patientId} /></div>
    </header>
    {admissions.error ? <p role="alert" className="my-4 text-sm text-amber-text">Inpatient status could not be read. <Button variant="ghost" fullWidth={false} onClick={admissions.reload}>Retry admission status</Button></p> : null}
    {tab !== 'details' ? <div className="mb-3"><CheckInCoverPrompt patientId={record.patientId} onRecord={() => changeTab('details')} /></div> : null}
    <SectionTabs label="Patient record sections" className="mb-5" value={tab} onChange={(value) => changeTab(value)} options={tabs.map((value) => ({ value, label: PATIENT_TABS[value] }))} />
    {needsAttention ? <div role="alert" className="mb-5 rounded-field border border-amber-border bg-amber-bg p-4 text-sm text-amber-text">Some records for this patient need sync review. Signed on this device does not mean accepted by the server. <Button variant="ghost" fullWidth={false} onClick={() => navigate('/sync')}>Open Sync &amp; device</Button></div> : null}
    {rejections.error ? <p role="alert" className="mb-4 text-sm text-amber-text">Sync review status could not be read. <button type="button" className="font-bold text-brand" onClick={rejections.reload}>Retry sync status</button></p> : null}
    {chart.data && new Set(chart.data.current.map((event) => event.recordId)).size < chart.data.current.length ? <p role="alert" className="mb-4 rounded-field bg-amber-bg p-4 text-sm text-amber-text">Competing clinical versions need reconciliation. Review all versions and Sync &amp; device before relying on the record.</p> : null}
    <div id="patient-section-heading" tabIndex={-1} className="outline-none">
      {tab === 'details' ? <PersonalDetails patient={record} canEdit={canEdit} onEdit={() => setEditing(true)} onPrint={() => setCardOpen(true)} /> : null}
      {tab === 'now' ? <PatientNow patientId={patientId} chart={chart.data} chartUnavailable={chartUnavailable} admission={admissionCard} openVisits={openVisits} history={history} appointments={appointments} canRecord={canRecord} onVisit={viewVisit} onHistory={showHistory} onClinical={onClinical} /> : null}
      {tab === 'history' ? reading ? chart.data ? selected ? <VisitRecord key={selected.id} summary={selectedSummary} patient={record} encounter={selected} entries={chart.data.entries.filter((entry) => entry.encounterId === selected.id)} staffNames={chart.data.staffNames} canRecord={canRecord} onBack={() => showHistory('visits')} onContinue={() => viewVisit(selected.id, true)} onRefresh={chart.reload} onAppointments={() => showHistory('appointments')} /> : <div role="alert"><p>This visit is not available in this patient's record on this device.</p><Button variant="ghost" onClick={() => showHistory('visits')}>Back to visits</Button></div> : chartUnavailable
        : <PatientHistory view={show} period={period} views={views} onView={showHistory} onPeriod={setPeriod} patient={record} patientId={patientId} chart={chart.data} chartUnavailable={chartUnavailable} history={history} appointments={appointments} appointmentsLoading={bookings.loading || (canChart && chart.loading)} appointmentsError={bookings.error ?? (canChart ? chart.error : undefined)} onReloadAppointments={() => { bookings.reload(); chart.reload(); }} canRecord={canRecord} canBook={canBook} onBook={() => setBooking(true)} onStartAppointment={startAppointment} onVisit={viewVisit} onVisitAction={visitAction} onClinical={onClinical} /> : null}
      {tab === 'clinical' ? chart.data ? <ClinicalRecordManager key={kind} patientId={patientId} data={chart.data} kind={kind} canRecord={canRecord} onKindChange={onClinical} onRefresh={chart.reload} /> : chartUnavailable : null}
    </div>
    {booking ? <BookAppointmentSheet patient={reference} onClose={() => { setBooking(false); bookings.reload(); }} /> : null}
    {cardOpen ? <PatientCard patient={record} facilityName={facility.name} onClose={() => setCardOpen(false)} /> : null}
    {editing && canEdit ? <PersonalDetailsEditor key={record.patientId} patient={record} onClose={() => setEditing(false)} onSaved={() => { patient.reload(); chart.reload(); }} /> : null}
  </div>;
};
