import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ClinicalKind, patientSexLabel } from '@shared';
import { ActionMenu, Button, SectionTabs } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { useAuthorizationContext, useSession } from '@/session';
import { useLiveQuery } from '@/data';
import { patientClinicalRecord } from '@/data/repos/clinical';
import { listOpenRejections } from '@/data/repos/syncRejections';
import { PatientCard } from './PatientCard';
import { PatientIdentityPanel } from './PatientIdentityPanel';
import { AllergyAlert } from '@/features/clinical';
import { BookAppointmentSheet, useAppointments, type AppointmentPatient, type BookedAppointment } from '@/features/appointments';
import { summariseEncounter, type EncounterSummary } from '@/features/encounter';
import { VisitTable, visitDate, type VisitAction } from '@/features/encounter/VisitTable';
import { currentAge, usePatient } from '@/features/search';
import { MedicalChart } from './MedicalChart';
import { ClinicalRecordManager } from './ClinicalRecordManager';
import { PatientAppointments } from './PatientAppointments';
import { PersonalDetails, PersonalDetailsEditor } from './PersonalDetails';
import { VisitRecord } from './VisitRecord';
import { PATIENT_TABS, visitRecordPath, type PatientTab } from './patientRoutes';

const Message = ({ children }: { children: React.ReactNode }) => <div className="p-6 text-sm text-ink-soft">{children}</div>;

export const PatientProfile = ({ patientId }: { patientId?: string }) => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const context = useAuthorizationContext();
  const { facility } = useSession();
  const canRecord = context.permissions.includes('encounter:record');
  const canEdit = context.permissions.includes('patient:update');
  const canBook = context.permissions.includes('appointment:create');
  const patient = usePatient(patientId);
  const chart = useLiveQuery(useCallback(() => patientId ? patientClinicalRecord(patientId) : Promise.resolve(undefined), [patientId]));
  const rejections = useLiveQuery(listOpenRejections);
  const bookings = useAppointments();
  const [booking, setBooking] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const tabValue = params.get('tab') ?? 'overview';
  const tab: PatientTab = Object.keys(PATIENT_TABS).includes(tabValue) ? tabValue as PatientTab : 'overview';
  const categoryValue = params.get('category') ?? 'problem';
  const kind = ClinicalKind.safeParse(categoryValue).success ? categoryValue as ClinicalKind : 'problem';
  const history = useMemo(() => chart.data ? chart.data.encounters.map((encounter) => summariseEncounter(encounter, chart.data!.entries.filter((entry) => entry.encounterId === encounter.id))).sort((a, b) => b.openedOn.localeCompare(a.openedOn)) : [], [chart.data]);
  useEffect(() => { document.title = PATIENT_TABS[tab] + ' · Patient record · Geneus Health'; }, [tab]);
  useEffect(() => { const heading = document.querySelector<HTMLElement>('#patient-section-heading h2'); if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); } }, [tab, chart.loading]);

  if (!patientId) return <Message>No patient selected. <Button variant="ghost" onClick={() => navigate('/patients/search')}>Find a patient</Button></Message>;
  if (patient.loading) return <Message>Opening the patient record…</Message>;
  if (patient.error) return <Message>The record could not be read. <Button variant="ghost" onClick={patient.reload}>Try again</Button></Message>;
  if (!patient.data) return <Message>This patient is not on this device. <Button variant="ghost" onClick={() => navigate('/patients/search')}>Find a patient</Button></Message>;
  const record = patient.data;
  const appointments = bookings.forPatient(patientId);
  const activeVisits = history.filter((visit) => visit.status === 'Open');
  const active = activeVisits[0];
  const selected = chart.data?.encounters.find((encounter) => encounter.id === params.get('visit'));
  const selectedSummary = history.find((visit) => visit.id === selected?.id);
  const reading = tab === 'visits' && Boolean(params.get('visit'));
  const currentParams = () => { const next = new URLSearchParams(params); next.set('patient', patientId); next.set('tab', tab); return next; };
  const returnPath = '/patients/profile?' + currentParams();
  const changeTab = (value: PatientTab, category?: ClinicalKind) => setParams(() => {
    const next = currentParams(); next.set('tab', value); ['visit', 'panel', 'visitSection', 'booking'].forEach((key) => next.delete(key)); if (category) next.set('category', category); return next;
  });
  const onClinical = (category: ClinicalKind) => changeTab('clinical', category);
  const viewVisit = (id: string, continueVisit = false) => {
    const visit = history.find((candidate) => candidate.id === id);
    if (continueVisit && canRecord && visit?.status === 'Open') navigate(visitRecordPath(visit.patientId, visit.id, returnPath));
    else setParams(() => { const next = currentParams(); next.set('tab', 'visits'); next.set('visit', id); ['panel', 'visitSection', 'booking'].forEach((key) => next.delete(key)); return next; });
  };
  const visitAction = (visit: EncounterSummary, action: VisitAction) => {
    if (action === 'continue') return viewVisit(visit.id, true);
    setParams(() => { const next = currentParams(); next.set('tab', 'visits'); next.set('visit', visit.id); next.delete('visitSection'); next.delete('booking'); if (['print', 'activity', 'amend'].includes(action)) next.set('panel', action); else next.delete('panel'); return next; });
  };
  const start = () => activeVisits.length > 1 ? changeTab('visits') : active ? viewVisit(active.id, canRecord) : navigate(visitRecordPath(patientId, '', returnPath));
  const startAppointment = (appointment: BookedAppointment) => navigate(visitRecordPath(appointment.patient.id, appointment.encounterId ?? '', returnPath, appointment.id));
  const reference: AppointmentPatient = { id: record.patientId, name: record.fullName, initials: record.fullName.split(/\s+/).slice(0, 2).map((part) => part[0] ?? '').join(''), allergy: 'Review recorded allergies before care' };
  const canBill = context.permissions.some((permission) => ['payment:receive', 'payment:waive', 'fee_item:manage'].includes(permission));
  const actions = [
    { label: 'Print patient card', icon: 'print' as const, onSelect: () => setCardOpen(true) },
    { label: 'Personal details', icon: 'patients' as const, onSelect: () => changeTab('details') },
    ...(canBill ? [{ label: 'Patient billing account', onSelect: () => navigate('/billing?patient=' + encodeURIComponent(patientId)) }] : []),
    ...(context.permissions.includes('handoff:create') ? [{ label: 'Send to another unit', onSelect: () => navigate('/patients/send-to-unit', { state: { patientId: active?.patientId ?? patientId, encounterId: active?.id } }) }] : []),
  ];
  const relatedIds = new Set(chart.data?.patients.map((item) => item.patientId) ?? [patientId]);
  const needsAttention = rejections.data?.some((rejection) => relatedIds.has(String(rejection.refusedRecord?.patientId ?? '')) || rejection.entityId === patientId || history.some((visit) => visit.id === rejection.entityId) || chart.data?.entries.some((entry) => entry.id === rejection.entityId));

  return <div className="min-h-screen bg-white px-4 pb-8 pt-4 md:px-8">
    <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft"><button type="button" className="min-h-[32px] font-semibold text-brand" onClick={() => navigate(params.get('from')?.startsWith('/patients/search?') ? params.get('from')! : '/patients/search')}>Patients</button><div className="sm:hidden"><SyncPill /></div></nav>
    {record.identityStatus === 'provisional' ? <section className="my-3 space-y-2 rounded-field bg-amber-bg p-4 text-sm text-amber-text" aria-label="Provisional patient identity"><h2 className="font-bold">Identity not yet known</h2><p>This is a provisional record. Confirm the patient ID before care. Add identity when reliable information becomes available.</p>{canEdit ? <Button variant="outlined" fullWidth={false} onClick={() => setEditing(true)}>Identify patient</Button> : null}{context.permissions.includes('patient_identity:review') ? <Button variant="ghost" fullWidth={false} onClick={() => navigate(`/patients/identity?other=${encodeURIComponent(record.patientId)}`)}>Review an existing record</Button> : null}</section> : null}
    <header className="border-b border-outline-soft pb-2">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><h1 className="break-words text-[28px] font-extrabold tracking-tight">{record.fullName}</h1><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft"><span className="break-all font-mono">{record.patientId}</span><span>{currentAge(record) === undefined ? 'Age not recorded' : String(currentAge(record)) + ' years'} · {patientSexLabel(record.sex)}</span></div></div>
        <div className="flex flex-wrap gap-2">{!reading || selectedSummary?.status === 'Open' ? active ? <Button fullWidth={false} onClick={start}>{canRecord ? 'Continue visit' : 'View visit'}</Button> : canRecord ? <Button fullWidth={false} disabled={chart.loading || Boolean(chart.error) || !chart.data} onClick={start}>Start visit</Button> : null : null}{canBook && !reading ? <Button variant="outlined" fullWidth={false} onClick={() => setBooking(true)}>Book appointment</Button> : null}<ActionMenu label="More actions" actions={actions} /></div>
      </div>
      <div className="mt-4"><AllergyAlert patientId={record.patientId} /></div>
    </header>
    <SectionTabs label="Patient record sections" className="mb-5" value={tab} onChange={changeTab} options={Object.entries(PATIENT_TABS).map(([value, label]) => ({ value: value as PatientTab, label }))} />
    {needsAttention ? <div role="alert" className="mb-5 rounded-field border border-amber-border bg-amber-bg p-4 text-sm text-amber-text">Some records for this patient need sync review. Signed on this device does not mean accepted by the server. <Button variant="ghost" fullWidth={false} onClick={() => navigate('/sync')}>Open Sync &amp; device</Button></div> : null}
    {rejections.error ? <p role="alert" className="mb-4 text-sm text-amber-text">Sync review status could not be read. <button type="button" className="font-bold text-brand" onClick={rejections.reload}>Retry sync status</button></p> : null}
    {chart.data && new Set(chart.data.current.map((event) => event.recordId)).size < chart.data.current.length ? <p role="alert" className="mb-4 rounded-field bg-amber-bg p-4 text-sm text-amber-text">Competing clinical versions need reconciliation. Review all versions and Sync &amp; device before relying on the record.</p> : null}
    <div id="patient-section-heading" tabIndex={-1} className="outline-none">
      {tab === 'details' ? <PersonalDetails patient={record} canEdit={canEdit} onEdit={() => setEditing(true)} onPrint={() => setCardOpen(true)} /> : tab === 'appointments' ? <PatientAppointments appointments={appointments} history={history} loading={bookings.loading || chart.loading} error={bookings.error ?? chart.error} onReload={() => { bookings.reload(); chart.reload(); }} canBook={canBook} canRecord={canRecord} onBook={() => setBooking(true)} onStart={startAppointment} onVisit={viewVisit} /> : chart.loading ? <p role="status">Reading the medical chart…</p> : chart.error || !chart.data ? <div role="alert"><p>The clinical record could not be read.</p><Button variant="ghost" onClick={chart.reload}>Try again</Button></div> : reading ? selected ? <VisitRecord key={selected.id} patient={record} encounter={selected} entries={chart.data.entries.filter((entry) => entry.encounterId === selected.id)} staffNames={chart.data.staffNames} canRecord={canRecord} onBack={() => changeTab('visits')} onContinue={() => viewVisit(selected.id, true)} onRefresh={chart.reload} onAppointments={() => changeTab('appointments')} /> : <div role="alert"><p>This visit is not available in this patient's record on this device.</p><Button variant="ghost" onClick={() => changeTab('visits')}>Back to visits</Button></div> : <>
        {tab === 'overview' ? <><div className="mb-5"><h2 className="text-[28px] font-extrabold">Medical chart</h2><p className="mt-1 text-sm text-ink-soft">Clinical information across all visits. Saved records on this device.</p></div>{active ? <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-field border border-outline-soft bg-brand-wash p-4"><div><p className="font-bold">Current visit · {visitDate(active.openedOn)}</p><p className="mt-1 text-sm">{active.title} · {active.nextAction}</p></div><Button variant="outlined" fullWidth={false} onClick={start}>{canRecord ? 'Continue visit' : 'View visit'}</Button></div> : null}{activeVisits.length > 1 ? <p role="alert" className="mb-4 text-sm text-amber-text">There are {activeVisits.length} open visits across this patient's linked records. Review Visits before starting another episode.</p> : null}<PatientIdentityPanel patientId={patientId} /><MedicalChart data={chart.data} appointments={appointments} appointmentsUnavailable={bookings.loading || Boolean(bookings.error)} onClinical={onClinical} onVisit={viewVisit} onAppointments={() => changeTab('appointments')} /></> : null}
        {tab === 'visits' ? <>{active ? <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-field border border-outline-soft bg-brand-wash p-4"><div><p className="font-bold">Current visit · {visitDate(active.openedOn)}</p><p className="mt-1 text-sm">{active.title} · In progress · {active.nextAction}</p></div><Button variant="outlined" fullWidth={false} onClick={start}>{canRecord ? 'Continue visit' : 'View visit'}</Button></div> : null}<h2 className="mb-1 text-2xl font-extrabold">Visits</h2><p className="mb-5 text-sm text-ink-soft">Every recorded episode, newest first. Open a saved visit or continue care.</p><VisitTable visits={history} canRecord={canRecord} onAction={visitAction} /></> : null}
        {tab === 'clinical' ? <ClinicalRecordManager key={kind} patientId={patientId} data={chart.data} kind={kind} canRecord={canRecord} onKindChange={onClinical} onRefresh={chart.reload} /> : null}
      </>}
    </div>
    {booking ? <BookAppointmentSheet patient={reference} onClose={() => { setBooking(false); bookings.reload(); }} /> : null}
    {cardOpen ? <PatientCard patient={record} facilityName={facility.name} onClose={() => setCardOpen(false)} /> : null}
    {editing && canEdit ? <PersonalDetailsEditor key={record.patientId} patient={record} onClose={() => setEditing(false)} onSaved={() => { patient.reload(); chart.reload(); }} /> : null}
  </div>;
};
