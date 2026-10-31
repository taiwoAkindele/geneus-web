import { useEffect } from 'react';
import { linkedPatientIds } from '@shared';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, SectionTabs, SelectField } from '@/ui';
import { useInpatient } from '@/features/inpatient/useInpatient';
import { clinicalPatientRows, withAdmission } from '@/features/inpatient/summary';
import { readDeviceStation, rememberDeviceStation, useEncounterList, useStationQueues, type EncounterSummary, type StationView } from '@/features/encounter';
import { VisitTable, type VisitAction } from '@/features/encounter/VisitTable';
import { patientChartPath, visitRecordPath } from '@/features/patients/patientRoutes';
import { usePatients } from '@/features/search';
import { useAuthorizationContext } from '@/session';

const STATION_LABEL: Record<StationView, string> = { all: 'All visits', lab: 'Lab', results: 'Results ready', pharmacy: 'Pharmacy' };
export const EncountersScreen = () => {
  const navigate = useNavigate();
  useEffect(() => { document.title = 'Visits · Geneus Health'; }, []);
  const [params, setParams] = useSearchParams();
  const context = useAuthorizationContext();
  const encounters = useEncounterList();
  const admissions = useInpatient();
  const patients = usePatients();
  const queues = useStationQueues();
  const stationValue = params.get('queue') ?? readDeviceStation();
  const station: StationView = Object.keys(STATION_LABEL).includes(stationValue) ? stationValue as StationView : 'all';
  const canRecord = context.permissions.includes('encounter:record');
  const all = [...(encounters.data?.open ?? []), ...(encounters.data?.closed ?? [])].map((visit) => withAdmission(visit, admissions.data)).sort((a, b) => b.openedOn.localeCompare(a.openedOn));
  const rows = clinicalPatientRows(all, admissions.data?.identities);
  const care = ['inpatient','outpatient'].includes(params.get('care') ?? '') ? params.get('care')! : 'all';
  const queued = station === 'all' ? [] : queues.data?.[station] ?? [];
  const queueMap = new Map(queued.map((item) => [item.encounterId, item]));
  const candidates = station === 'all' ? rows : all.filter((visit) => queueMap.has(visit.id)).sort((a, b) => (queueMap.get(a.id)?.waitingSince ?? '').localeCompare(queueMap.get(b.id)?.waitingSince ?? ''));
  const activePatients = new Set(admissions.data?.active.flatMap((event) => linkedPatientIds(event.patientId, admissions.data?.identities ?? [])) ?? []);
  const shown = candidates.filter((visit) => care === 'all' || (care === 'inpatient' ? visit.careType === 'inpatient' : !activePatients.has(visit.patientId) && visit.careType === 'outpatient'));
  const action = (visit: EncounterSummary, value: VisitAction) => value === 'continue'
    ? navigate(visitRecordPath(visit.patientId, visit.id, '/encounters?' + params) + (station === 'all' ? '' : '&task=' + (station === 'lab' ? 'lab_results' : station === 'pharmacy' ? 'dispense' : 'result_review')))
    : navigate(patientChartPath(visit.patientId, 'visits', { visit: visit.id, ...(value !== 'view' ? { panel: value } : {}) }));
  return <div className="min-h-screen bg-white px-4 py-5 md:px-8">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-[28px] font-extrabold">Clinical patients</h1><p className="mt-1 text-sm text-ink-soft">Find current care and open the patient’s chart. Full visit history stays in the chart.</p></div><div className="flex flex-wrap gap-2">{context.permissions.includes('admission:manage') ? <Button variant="outlined" fullWidth={false} onClick={() => navigate('/admissions')}>Wards &amp; admissions</Button> : null}<Button variant="outlined" fullWidth={false} onClick={() => navigate('/appointments')}>Appointments</Button><Button fullWidth={false} onClick={() => navigate('/patients/search')}>Find patient / start visit</Button></div></div>
    <SectionTabs label="Patient care type" className="mb-5" value={care} onChange={(value) => setParams((current) => { const next = new URLSearchParams(current); next.set('care', value); next.delete('visitPage'); return next; }, { replace: true })} options={[{ value: 'all', label: 'All', count: rows.length }, { value: 'inpatient', label: 'Inpatients', count: rows.filter((visit) => visit.careType === 'inpatient').length }, { value: 'outpatient', label: 'Outpatients', count: rows.filter((visit) => visit.careType === 'outpatient' && !activePatients.has(visit.patientId)).length }]} />
    <div className="mb-5 max-w-sm"><SelectField label="Service queue" value={station} onChange={(event) => { const value = event.target.value; rememberDeviceStation(value as StationView); setParams((current) => { const next = new URLSearchParams(current); next.set('queue', value); next.delete('visitPage'); return next; }, { replace: true }); }} options={(Object.keys(STATION_LABEL) as StationView[]).map((value) => ({ value, label: value === 'all' ? 'All services' : STATION_LABEL[value] }))} /></div>
    {station !== 'all' ? <p className="mb-4 text-sm text-ink-soft">{STATION_LABEL[station]} · oldest waiting first until sorted.</p> : null}
    {encounters.loading || patients.loading || admissions.loading || (station !== 'all' && queues.loading) ? <p role="status">Reading visits…</p> : encounters.error || patients.error || admissions.error || (station !== 'all' && queues.error) ? <div role="alert"><p>Visits could not be read.</p><Button variant="ghost" onClick={() => { encounters.reload(); patients.reload(); queues.reload(); admissions.reload(); }}>Try again</Button></div> : <VisitTable serviceQueue={station !== 'all'} visits={shown} patients={patients.data} canRecord={canRecord} onAction={action} orderLabel={station === 'all' ? 'one row per patient; newest visit or active admission' : 'oldest waiting first unless sorted'} detailFor={station !== 'all' ? (visit) => queueMap.get(visit.id)?.detail ?? visit.nextAction : undefined} />}
    <p className="mt-5 text-sm text-ink-soft">Records on this device update when it syncs. Planned bookings stay in Appointments until care is recorded.</p>
  </div>;
};
