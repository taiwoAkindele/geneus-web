import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ChoiceChip } from '@/ui';
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
  const patients = usePatients();
  const queues = useStationQueues();
  const stationValue = params.get('queue') ?? readDeviceStation();
  const station: StationView = Object.keys(STATION_LABEL).includes(stationValue) ? stationValue as StationView : 'all';
  const canRecord = context.permissions.includes('encounter:record');
  const all = [...(encounters.data?.open ?? []), ...(encounters.data?.closed ?? [])].sort((a, b) => b.openedOn.localeCompare(a.openedOn));
  const queued = station === 'all' ? [] : queues.data?.[station] ?? [];
  const queueMap = new Map(queued.map((item) => [item.encounterId, item]));
  const shown = station === 'all' ? all : all.filter((visit) => queueMap.has(visit.id)).sort((a, b) => (queueMap.get(a.id)?.waitingSince ?? '').localeCompare(queueMap.get(b.id)?.waitingSince ?? ''));
  const action = (visit: EncounterSummary, value: VisitAction) => value === 'continue'
    ? navigate(visitRecordPath(visit.patientId, visit.id, '/encounters?' + params))
    : navigate(patientChartPath(visit.patientId, 'visits', { visit: visit.id, ...(value !== 'view' ? { panel: value } : {}) }));
  return <div className="min-h-screen bg-white px-4 py-5 md:px-8">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-[28px] font-extrabold">Visits</h1><p className="mt-1 text-sm text-ink-soft">One list of recorded care. Filter by patient, date, status or queue.</p></div><div className="flex flex-wrap gap-2"><Button variant="outlined" fullWidth={false} onClick={() => navigate('/appointments')}>Appointments</Button><Button fullWidth={false} onClick={() => navigate('/patients/search')}>Find patient / start visit</Button></div></div>
    <div className="mb-5 flex flex-wrap gap-2" aria-label="Visit queue filters">{(Object.keys(STATION_LABEL) as StationView[]).map((value) => <ChoiceChip key={value} selected={station === value} onClick={() => { rememberDeviceStation(value); setParams((current) => { const next = new URLSearchParams(current); next.set('queue', value); next.delete('visitPage'); return next; }, { replace: true }); }}>{STATION_LABEL[value]}{value !== 'all' && queues.data ? ' · ' + queues.data[value].length : ''}</ChoiceChip>)}</div>
    {station !== 'all' ? <p className="mb-4 text-sm text-ink-soft">{STATION_LABEL[station]} · oldest waiting first until sorted.</p> : null}
    {encounters.loading || patients.loading || (station !== 'all' && queues.loading) ? <p role="status">Reading visits…</p> : encounters.error || patients.error || (station !== 'all' && queues.error) ? <div role="alert"><p>Visits could not be read.</p><Button variant="ghost" onClick={() => { encounters.reload(); patients.reload(); queues.reload(); }}>Try again</Button></div> : <VisitTable visits={shown} patients={patients.data} canRecord={canRecord} onAction={action} orderLabel={station === 'all' ? 'newest first unless sorted' : 'oldest waiting first unless sorted'} detailFor={station !== 'all' ? (visit) => queueMap.get(visit.id)?.detail ?? visit.nextAction : undefined} />}
    <p className="mt-5 text-sm text-ink-soft">Records on this device update when it syncs. Planned bookings stay in Appointments until care is recorded.</p>
  </div>;
};
