import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { INPATIENT_STATUS, inpatientBedStates, wardForBed, type InpatientEvent, type InpatientAction, type BedState } from '@shared';
import { Button, SectionTabs, SelectField, Sheet, Tag, TextField } from '@/ui';
import { WardTable } from '@/features/inpatient/WardTable';
import { useAuthorizationContext } from '@/session';
import { usePatients } from '@/features/search';
import { useInpatient } from '@/features/inpatient/useInpatient';
import { AdmissionActionSheet, ADMISSION_ACTION_LABELS, type AdmissionTask } from '@/features/inpatient/AdmissionActionSheet';
import { patientChartPath } from '@/features/patients/patientRoutes';
import { confirmBedReady } from '@/data/repos/inpatient';
import { inpatientSupported } from '@/data/inpatientSupport';

const availableActions = (event: InpatientEvent): [InpatientAction, string][] => {
  if (event.action === 'confirm') return [['reserve', 'Reserve bed'], ['cancel', 'Cancel admission']];
  if (event.action === 'reserve') return [['arrive', 'Confirm arrival'], ['reserve', 'Change reservation'], ['cancel', 'Cancel admission']];
  if (event.action === 'ready_for_discharge') return [['discharge', 'Confirm departure'], ['continue_care', 'Continue ward care']];
  if (['arrive','transfer','continue_care'].includes(event.action)) return [['transfer', 'Transfer bed'], ['ready_for_discharge', 'Ready for discharge']];
  return [];
};
export const InpatientScreen = () => {
  const query = useInpatient(), patients = usePatients(), context = useAuthorizationContext();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'requests';
  const [search, setSearch] = useState('');
  const [history, setHistory] = useState(false);
  const [task, setTask] = useState<AdmissionTask>();
  const [activity, setActivity] = useState<string>();
  const [cleaning, setCleaning] = useState<{ bedId: string; releaseId: string; name: string }>();
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { document.title = 'Wards & admissions · Geneus Health'; }, []);
  if (query.loading || patients.loading) return <p role="status" className="p-6">Reading wards and admissions…</p>;
  if (!query.data || query.error || patients.error) return <div role="alert" className="p-6"><p>Admissions could not be read.</p><Button variant="outlined" onClick={() => { query.reload(); patients.reload(); }}>Try again</Button></div>;
  const data = query.data;
  const name = (id: string) => patients.data?.find((patient) => patient.patientId === id)?.fullName ?? id;
  const locationName = (id?: string) => data.locations.find((location) => location.id === id)?.name ?? '';
  const teamName = (id: string) => data.units.find((unit) => unit.id === id)?.name ?? id;
  const matches = (id: string) => (!params.get('patient') || params.get('patient') === id) && `${name(id)} ${id}`.toLowerCase().includes(search.toLowerCase());
  const supported = inpatientSupported(context);
  const patientLink = (id: string, encounterId: string) => <Link className="inline-flex min-h-[52px] items-center font-bold text-brand underline" to={patientChartPath(id, 'visits', { visit: encounterId })}>Open patient chart</Link>;
  const requests = data.requests.filter((request) => matches(request.patientId));
  const stays = (history ? data.heads : data.active).filter((event) => matches(event.patientId));
  const bedStates = inpatientBedStates(data.events, data.ready);
  const beds = data.locations.filter((location) => location.kind === 'bed' && location.active).map((bed) => ({ bed, ward: wardForBed(bed, data.locations), state: bedStates.get(bed.id) ?? { status: 'Available' } as BedState }));
  const activityEvents: InpatientEvent[] = [];
  let cursor = data.heads.find((stay) => stay.admissionId === activity);
  while (cursor && !activityEvents.some((event) => event.id === cursor!.id)) { activityEvents.unshift(cursor); cursor = data.events.find((event) => event.id === cursor!.previousId); }
  const saveCleaning = async () => {
    if (!cleaning) return; setSaving(true); setError('');
    try { await confirmBedReady(cleaning.bedId, cleaning.releaseId, context); setCleaning(undefined); query.reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not record bed readiness'); }
    finally { setSaving(false); }
  };
  return <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-6 md:px-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-[28px] font-extrabold">Wards &amp; admissions</h1><p className="mt-1 text-ink-soft">Receive admission requests and manage the patient’s hospital stay.</p></div><Link to="/encounters?care=inpatient&queue=all" className="inline-flex min-h-[52px] items-center font-bold text-brand underline">Clinical patient list</Link></header>
    {!supported ? <div role="status" className="rounded-field bg-amber-bg p-4 text-amber-text">Connect once to confirm server support before recording admissions. <Button variant="ghost" fullWidth={false} onClick={query.reload}>Check again</Button></div> : null}
    {data.rejected.size ? <div role="alert" className="rounded-field bg-amber-bg p-4 text-amber-text">Some ward changes were refused during sync and do not establish a stay or bed allocation. <Link to="/sync" className="font-bold underline">Review refused changes</Link></div> : null}
    <SectionTabs label="Ward work" value={tab} onChange={(value) => setParams((current) => { const next = new URLSearchParams(current); next.set('tab', value); return next; })} options={[{ value: 'requests', label: 'Admission requests', count: data.requests.length }, { value: 'inpatients', label: 'Inpatients', count: data.active.length }, { value: 'beds', label: 'Beds', count: beds.length }]} />
    {tab !== 'beds' ? <div className="flex flex-wrap items-end gap-4"><TextField label="Search patients" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Patient name or ID" />{params.get('patient') ? <Button variant="ghost" fullWidth={false} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.delete('patient'); return next; })}>Show all patients</Button> : null}{tab === 'inpatients' ? <SelectField label="Stay history" value={history ? 'all' : 'active'} onChange={(event) => setHistory(event.target.value === 'all')} options={[{ value: 'active', label: 'Active admissions' }, { value: 'all', label: 'Include discharged / cancelled' }]} /> : null}</div> : null}
    {tab === 'requests' ? requests.length ? <WardTable caption="Admission requests" rows={requests} rowKey={(request) => request.id} columns={[
      { key: 'patient', label: 'Patient / visit', render: (request) => <><p className="font-bold">{name(request.patientId)}</p><p className="break-all text-sm text-ink-soft">{request.patientId}</p>{patientLink(request.patientId, request.encounterId)}</> },
      { key: 'request', label: 'Signed request', render: (request) => <><p>{new Date(request.createdOn).toLocaleString('en-GB')}</p><p className="mt-1 text-sm text-ink-soft">{String(request.values.responsibleService ?? request.values.ward ?? 'Receiving team to confirm')}</p><p className="mt-1 text-sm">{String(request.values.note ?? '')}</p></> },
      { key: 'action', label: 'Next action', render: (request) => <Button fullWidth={false} disabled={!supported} onClick={() => setTask({ action: 'confirm', request })}>Review admission</Button> },
    ]} /> : <p className="rounded-field border border-dashed border-outline p-6">No admission requests match this view. Signed admission requests appear here after consultation.</p> : null}
    {tab === 'inpatients' ? stays.length ? <WardTable caption="Inpatient stays" rows={stays} rowKey={(stay) => stay.admissionId} columns={[
      { key: 'patient', label: 'Patient / visit', render: (stay) => <><p className="font-bold">{name(stay.patientId)}</p><p className="break-all text-sm text-ink-soft">{stay.patientId}</p><p className="mt-1 text-sm text-ink-soft">Admitted {new Date(data.events.find((event) => event.id === stay.admissionId)?.createdOn ?? stay.createdOn).toLocaleDateString('en-GB')}</p>{patientLink(stay.patientId, stay.encounterId)}</> },
      { key: 'bed', label: 'Ward / bed / team', render: (stay) => <><p>{[locationName(stay.wardId), locationName(stay.bedId)].filter(Boolean).join(' · ') || 'Awaiting bed'}</p><p className="mt-1 text-sm text-ink-soft">{teamName(stay.receivingUnitId)}</p></> },
      { key: 'status', label: 'Stay status', render: (stay) => <><Tag tone={stay.action === 'confirm' || stay.action === 'reserve' ? 'amber' : 'slate'}>{INPATIENT_STATUS[stay.action]}</Tag>{data.pending.has(stay.id) ? <p className="mt-2 text-sm text-amber-text">Pending server confirmation</p> : null}</> },
      { key: 'action', label: 'Next action', render: (stay) => <div className="flex flex-col items-start gap-2">{availableActions(stay).map(([action, label]) => <Button key={action} variant="outlined" fullWidth={false} disabled={!supported} onClick={() => setTask({ action, admission: stay })}>{label}</Button>)}<Button variant="ghost" fullWidth={false} onClick={() => setActivity(stay.admissionId)}>Stay activity</Button></div> },
    ]} /> : <p className="rounded-field border border-dashed border-outline p-6">No inpatient stays match this view.</p> : null}
    {tab === 'beds' ? beds.length ? <WardTable caption="Ward bed board" rows={beds} rowKey={(row) => row.bed.id} columns={[
      { key: 'bed', label: 'Ward / bed', render: (row) => <><p className="font-bold">{row.ward?.name ?? 'Ward not configured'}</p><p>{row.bed.name}</p></> },
      { key: 'status', label: 'Bed status', render: (row) => <><Tag tone={['Cleaning','Conflict'].includes(row.state.status) ? 'amber' : 'slate'}>{row.state.status}</Tag>{[row.state.admission?.id, row.state.release?.id].some((id) => id && data.pending.has(id)) || data.ready.some((event) => event.bedId === row.bed.id && data.pending.has(event.id)) ? <p className="mt-2 text-sm text-amber-text">Pending server confirmation</p> : null}</> },
      { key: 'patient', label: 'Patient', render: (row) => row.state.admission ? <><p>{name(row.state.admission.patientId)}</p>{patientLink(row.state.admission.patientId, row.state.admission.encounterId)}</> : '—' },
      { key: 'action', label: 'Next action', render: (row) => row.state.status === 'Cleaning' && row.state.release ? <Button variant="outlined" fullWidth={false} disabled={!supported} onClick={() => { setError(''); setCleaning({ bedId: row.bed.id, releaseId: row.state.release!.id, name: [row.ward?.name, row.bed.name].filter(Boolean).join(' · ') }); }}>Confirm cleaned &amp; ready</Button> : null },
    ]} /> : <p className="rounded-field border border-dashed border-outline p-6">No beds are configured. {context.permissions.includes('location:manage') ? <Link to="/facility?view=locations" className="font-bold text-brand underline">Set up wards and beds</Link> : 'Ask the facility administrator to configure wards and beds.'}</p> : null}
    <p className="text-sm text-ink-soft">Reserved beds are not occupied until arrival is recorded. Ready for discharge stays inpatient until actual departure. Offline changes remain subject to server conflict checks.</p>
    {task ? <AdmissionActionSheet key={`${task.action}:${task.admission?.id ?? task.request?.id}`} task={task} data={data} patientName={name(task.admission?.patientId ?? task.request?.patientId ?? '')} onClose={() => setTask(undefined)} onSaved={() => { setTask(undefined); query.reload(); }} /> : null}
    {activity ? <Sheet title="Stay activity" eyebrow={activityEvents[0] ? name(activityEvents[0].patientId) : 'Admission history'} onClose={() => setActivity(undefined)} placement="side"><ol className="divide-y divide-outline-soft">{activityEvents.map((event) => <li key={event.id} className="py-4"><p className="font-bold">{ADMISSION_ACTION_LABELS[event.action]}</p><p className="mt-1 text-sm text-ink-soft">{new Date(event.createdOn).toLocaleString('en-GB')} · {data.staff.find((member) => member.staffId === event.createdBy)?.fullName ?? event.createdBy} · {event.actorRole}</p>{event.bedId ? <p className="mt-1 text-sm">{locationName(event.wardId)} · {locationName(event.bedId)}</p> : null}{event.note ? <p className="mt-2 whitespace-pre-wrap text-sm">{event.note}</p> : null}{data.pending.has(event.id) ? <p className="mt-1 text-sm text-amber-text">Pending server confirmation</p> : null}</li>)}</ol></Sheet> : null}
    {cleaning ? <Sheet title="Confirm bed ready" eyebrow={cleaning.name} onClose={() => setCleaning(undefined)} closeDisabled={saving}><p className="mb-5">Confirm that cleaning and the hospital’s bed-readiness checks are complete.</p>{error ? <p role="alert" className="mb-4 text-danger">{error}</p> : null}<Button disabled={saving} onClick={saveCleaning}>{saving ? 'Saving…' : 'Confirm cleaned & ready'}</Button></Sheet> : null}
  </div>;
};
