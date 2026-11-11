import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { currentFacilityRevisions, type AnyDocument, type ServiceSession } from '@shared';
import { Button, DataTable, SectionTabs, SelectField, Sheet, TextAreaField, TextField, Tag } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { saveIntake, eventHeads, type WorkforceData } from '@/data/repos/workforce';
import { workforceReadiness } from '@/lib/api/workforce';
import { showInterval, zonedInput } from '@/lib/workforceTime';
import { RecordEditor } from './RecordEditor';
import type { EditorKind } from './editorFields';
import { useWorkforce } from './useWorkforce';
import { humanize, intakeLabel, proposalState, recordName, unitPath } from './presentation';
export const WorkspaceLoading = ({ error, reload }: {
  error?: Error;
  reload: () => void;
}) => error ? <div role="alert" className="m-5 rounded-card border border-danger p-5"><p>{error.message}</p><Button variant="outlined" onClick={reload}>Try again</Button></div> : <div role="status" className="m-5 h-40 animate-pulse rounded-card bg-surface-muted" aria-label="Reading facility records" />;
const Empty = ({ children }: {
  children: ReactNode;
}) => <div className="rounded-card border border-dashed border-outline bg-white p-6 text-sm text-ink-muted">{children}</div>;
const panel = 'rounded-card border border-outline-soft bg-white p-4 md:p-5';
type Edit = {
  kind: EditorKind;
  previous?: AnyDocument;
  preset?: Record<string, unknown>;
};
const canEdit = (kind: EditorKind, permissions: readonly string[]) => permissions.includes(({ unit: 'unit:manage', location: 'location:manage', service_definition: 'service:manage', service_offering: 'service:manage', practitioner_profile: 'practitioner:manage', staff_assignment: 'staff_assignment:manage', service_session: 'service_session:manage', billing_department: 'fee_item:manage', credential: 'credential:manage', capability_decision: 'clinical_capability:review', reviewer_delegation: 'clinical_capability:review' } as Record<EditorKind, string>)[kind]);
export const RecordList = ({ records, data, onEdit, detail }: {
  records: AnyDocument[];
  data: WorkforceData;
  onEdit?: (record: AnyDocument) => void;
  detail?: (record: AnyDocument) => ReactNode;
}) => records.length ? <DataTable caption="Facility records" rows={records} rowKey={(r) => r.id} columns={[
  { key: 'name', label: 'Name', sortValue: recordName, render: (r) => <div className="min-w-[120px]"><p className="font-bold">{r.type === 'service_offering' ? <Link className="text-brand underline" to={`/facility/services/${encodeURIComponent(r.id)}`}>{r.name}</Link> : recordName(r)}</p><p className="mt-1 text-xs text-ink-muted">{detail?.(r)}</p></div> },
  { key: 'state', label: 'State', render: (r) => <div className="space-y-1"><Tag tone={data.pending.has(r.id) ? 'amber' : 'neutral'}>{proposalState(r, data)}</Tag><p className="text-xs">{'active' in r ? r.active ? 'Available' : 'Retired' : 'status' in r ? humanize(String(r.status)) : 'configuration' in r ? humanize(String(r.configuration)) : ''}</p></div> },
  { key: 'action', label: 'Action', render: (r) => onEdit ? <Button fullWidth={false} variant="outlined" disabled={data.pending.has(r.id)} onClick={() => onEdit(r)}>Review / edit</Button> : <span className="text-xs text-ink-muted">View only</span> },
]} /> : <Empty>No records match this view. Add the actual service, team or place when you are ready.</Empty>;
const Readiness = () => {
  const context = useAuthorizationContext(), [result, setResult] = useState<{
    ready: boolean;
    blockers: {
      kind: string;
      ids: string[];
    }[];
  }>(), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const check = async () => {
    if (busy)
      return; setBusy(true); setError(''); try {
        setResult(await workforceReadiness(context));
      }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Readiness could not be checked');
    }
    finally {
      setBusy(false);
    }
  };
  return <section className={panel}><h2 className="font-bold">Clinical approval rollout</h2><p className="my-2 text-sm text-ink-muted">Your authorized facility lead reviews services, professional approvals and upgraded devices before clinical enforcement is activated. Saving setup does not activate it.</p><Button fullWidth={false} variant="outlined" loading={busy} onClick={() => void check()}>Check readiness online</Button>{error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}{result ? <div className="mt-3 text-sm" role="status"><p className="font-bold">{result.ready ? 'Ready for the authorized rollout review' : 'Items to complete before activation'}</p><ul className="mt-2 list-disc space-y-1 pl-5">{result.blockers.map((b) => <li key={b.kind}>{humanize(b.kind)} · {b.ids.length}</li>)}</ul></div> : null}</section>;
};
export const FacilityWorkspace = () => {
  const query = useWorkforce(), context = useAuthorizationContext(), [params, setParams] = useSearchParams(), [search, setSearch] = useState(''), [editing, setEditing] = useState<Edit>();
  const view = ['overview', 'services', 'structure', 'locations', 'finance'].includes(params.get('view') || '') ? params.get('view')! : 'overview';
  useEffect(() => { document.title = 'Facility setup · Geneus Health'; }, []);
  if (query.loading || !query.data)
    return <WorkspaceLoading error={query.error} reload={query.reload} />;
  if (query.error)
    return <WorkspaceLoading error={query.error} reload={query.reload} />;
  const data = query.data;
  const kind: EditorKind = view === 'structure' ? 'unit' : view === 'locations' ? 'location' : view === 'finance' ? 'billing_department' : 'service_offering';
  const collection = view === 'structure' ? data.units : view === 'locations' ? data.locations : view === 'finance' ? data.departments : data.offerings;
  const records = collection.filter((r) => recordName(r).toLowerCase().includes(search.toLowerCase()));
  const change = (next: string) => { setSearch(''); setParams({ view: next }); };
  return <div className="mx-auto max-w-7xl space-y-5 px-4 py-5 md:px-8"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-extrabold">Facility setup</h1><p className="mt-1 max-w-2xl text-sm text-ink-muted">Choose the care you provide, where it happens and who does it.</p></div>{view !== 'overview' && canEdit(kind, context.permissions) ? <Button fullWidth={false} onClick={() => setEditing({ kind })}>Add {view === 'structure' ? 'team' : view === 'locations' ? 'location' : view === 'finance' ? 'financial department' : 'service'}</Button> : null}</header>
    <SectionTabs label="Facility setup sections" value={view} onChange={change} options={[{ value: 'overview', label: 'Overview' }, { value: 'services', label: 'Services' }, { value: 'structure', label: 'Departments & units' }, { value: 'locations', label: 'Locations' }, { value: 'finance', label: 'Financial links' }]} />
    {view === 'overview' ? <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[
      { title: 'Care services', count: data.offerings.filter((o) => o.configuration === 'active').length, description: 'Configured care activities', to: 'services' },
      { title: 'Accountable teams', count: data.units.filter((u) => u.active).length, description: `${data.units.filter((u) => u.active && !u.kind).length} legacy classifications to review`, to: 'structure' },
      { title: 'Actual places', count: data.locations.filter((l) => l.active).length, description: 'Rooms, wards, outreach and stores', to: 'locations' },
      { title: 'Financial links', count: data.departments.filter((d) => d.active && !d.organizationUnitId).length, description: 'Existing financial teams awaiting mapping', to: 'finance' },
    ].map((card) => <button key={card.title} onClick={() => change(card.to)} className={`${panel} min-h-32 text-left hover:border-brand`}><span className="block text-sm font-bold">{card.title}</span><strong className="my-2 block text-3xl">{card.count}</strong><span className="text-xs text-ink-muted">{card.description}</span></button>)}</div>
      <section className={panel}><h2 className="text-lg font-bold">Complete setup in a few clear steps</h2><ol className="mt-3 space-y-3">{[{ label: 'Choose responsible teams', to: '/facility?view=structure', help: 'One care team may be enough for a PHC. Hospitals can nest units under departments.' }, { label: 'Add real locations', to: '/facility?view=locations', help: 'A place can be shared by several services; it is separate from the team responsible.' }, { label: 'Configure care services', to: '/facility?view=services', help: 'Choose the care activity, responsible team, places and patients accepted.' }, { label: 'Review people and assignments', to: '/admin/staff', help: 'Keep professional approval separate from software access and duty assignments.' }, { label: 'Plan service coverage', to: '/admin/staff?view=coverage', help: 'Create actual sessions, resources and sign-in links. Open intake separately.' }].map((step, index) => <li key={step.label} className="flex gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint font-bold text-brand">{index + 1}</span><div><Link to={step.to} className="inline-flex min-h-8 items-center font-bold text-brand underline">{step.label}</Link><p className="text-sm text-ink-muted">{step.help}</p></div></li>)}</ol></section>
      {context.permissions.includes('staff:manage') ? <Readiness /> : null}<p className="text-sm text-ink-muted">Each saved step is kept independently. A failed proposal does not erase earlier setup. <Link to="/sync" className="font-bold text-brand underline">Review sync and rejected proposals</Link>.</p></> : <>
      <p className="text-sm text-ink-muted">{view === 'structure' ? 'Teams own responsibility. Departments are optional; rooms belong under Locations.' : view === 'locations' ? 'Only add real places. A ward or bed entry is not a bed-occupancy system.' : view === 'finance' ? 'Link existing financial departments to accountable teams. Receiving accounts and historical amounts are preserved.' : 'A service is the care activity offered by a team. Configuration, equipment readiness, planned staffing and intake are separate.'}</p>
      <TextField label={`Find ${view === 'structure' ? 'a team' : view === 'locations' ? 'a place' : view === 'finance' ? 'a financial department' : 'a service'}`} type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      <RecordList records={records} data={data} onEdit={canEdit(kind, context.permissions) ? (previous) => setEditing({ kind, previous }) : undefined} detail={(r) => r.type === 'unit' ? `${r.kind ? humanize(r.kind) : 'Legacy team · classification needed'} · ${unitPath(r.id, data.units)}` : r.type === 'location' ? humanize(r.kind) : r.type === 'service_offering' ? `${unitPath(r.unitId, data.units)} · ${humanize(r.intakePolicy)} · Resources ${humanize(r.resourceReadiness)}` : r.type === 'billing_department' ? r.organizationUnitId ? unitPath(r.organizationUnitId, data.units) : 'Not yet linked' : ''} />
    </>}
    {editing ? <RecordEditor key={`${editing.kind}:${editing.previous?.id || 'new'}`} {...editing} data={data} onClose={() => setEditing(undefined)} onSaved={query.reload} /> : null}
  </div>;
};
const IntakeEditor = ({ data, offeringId, session, onClose }: {
  data: WorkforceData;
  offeringId: string;
  session?: ServiceSession;
  onClose: () => void;
}) => {
  const context = useAuthorizationContext(), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const heads = eventHeads(data.events.filter((e) => e.offeringId === offeringId && e.sessionId === session?.sessionId)), previous = heads[0];
  const available = !previous || previous.action === 'close' ? ['open'] : previous.action === 'pause' ? ['resume', 'close'] : ['pause', 'close'];
  const [action, setAction] = useState(available[0]);
  return <Sheet title="Change service intake" placement="side" onClose={onClose} closeDisabled={busy} hasUnsavedChanges={Boolean(reason)}><p className="mb-4 text-sm text-ink-muted">This changes acceptance of new work. Existing patient instructions and bookings remain visible.</p><SelectField label="Intake action" value={action} onChange={(e) => setAction(e.target.value)} options={available.map((value) => ({ value, label: humanize(value) }))} /><TextAreaField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} help={{ purpose: 'Pause and closure require an explanation for other staff.' }} />{error ? <p role="alert" className="my-3 text-sm text-danger">{error}</p> : null}<Button className="mt-4" loading={busy} disabled={busy || heads.length > 1} onClick={async () => {
    setBusy(true); try {
      await saveIntake(offeringId, session?.sessionId, action as 'open', reason, context, previous);
      onClose();
    }
      catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not change intake');
      }
      finally {
      setBusy(false);
    }
  }}>Confirm intake proposal</Button></Sheet>;
};
export const CoverageWorkspace = ({ offeringId, embedded = false }: {
  offeringId?: string;
  embedded?: boolean;
}) => {
  const navigate = useNavigate();
  const query = useWorkforce(), context = useAuthorizationContext(), [params, setParams] = useSearchParams(), [date, setDate] = useState(params.get('date') || zonedInput(new Date().toISOString(), 'Africa/Lagos').slice(0, 10)), [service, setService] = useState(offeringId || ''), [editing, setEditing] = useState<Edit>(), [intake, setIntake] = useState<ServiceSession>();
  if (query.loading || !query.data || query.error)
    return <WorkspaceLoading error={query.error} reload={query.reload} />;
  const data = query.data, sessions = currentFacilityRevisions(data.sessions).filter((s) => (!service || s.offeringId === service) && zonedInput(s.startsAt, s.timeZone).slice(0, 10) <= date && zonedInput(new Date(Date.parse(s.endsAt) - 1).toISOString(), s.timeZone).slice(0, 10) >= date).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  return <section className={embedded ? 'space-y-4' : 'mx-auto max-w-7xl space-y-5 px-4 py-5 md:px-8'}>{!embedded ? <><header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-extrabold">Staff & roster</h1><Link to="/admin/staff" className="text-sm font-bold text-brand underline">Staff directory</Link></header><SectionTabs label="Staff sections" value="coverage" onChange={(view) => {
    if (view !== 'coverage')
      navigate(`/admin/staff?view=${view}`);
  }} options={[{ value: 'directory', label: 'Staff' }, { value: 'coverage', label: 'Coverage' }, { value: 'roster', label: 'Sign-in windows' }]} /></> : null}
    <div className="flex flex-wrap items-end gap-3"><div className="min-w-40 flex-1"><TextField label="Coverage date" type="date" value={date} onChange={(e) => {
      setDate(e.target.value); if (!embedded) {
        const next = new URLSearchParams(params);
        next.set('date', e.target.value);
        setParams(next);
      }
    }} /></div>{!offeringId ? <div className="min-w-48 flex-1"><SelectField label="Service" value={service} onChange={(e) => setService(e.target.value)} options={[{ value: '', label: 'All services' }, ...data.offerings.map((o) => ({ value: o.id, label: o.name }))]} /></div> : null}{canEdit('service_session', context.permissions) ? <Button fullWidth={false} onClick={() => setEditing({ kind: 'service_session', preset: { offeringId: service || undefined } })}>Add session</Button> : null}</div>
    <p className="text-sm text-ink-muted">Planned coverage is separate from opened intake and attendance. Overnight sessions show both dates. On-call cover is not a claim of physical presence.</p>
    {sessions.length ? <div className="space-y-3">{sessions.map((s) => { const events = data.events.filter((e) => e.offeringId === s.offeringId && e.sessionId === s.sessionId); return <article key={s.id} className={panel}><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">{data.offerings.find((o) => o.id === s.offeringId)?.name || 'Service unavailable'}</h2><p className="mt-1 text-sm">{showInterval(s.startsAt, s.endsAt, s.timeZone)}</p></div><Tag>{humanize(s.status)}</Tag></div><p className="my-2 text-sm text-ink-muted">{s.participants.map((p) => `${data.staff.find((person) => person.staffId === p.staffId)?.fullName || 'Staff unavailable'} (${humanize(p.commitment)})`).join(', ')}</p><p className="text-sm">Intake: {intakeLabel(events,data)} · {proposalState(s, data)}</p><p className="mt-2 text-xs text-ink-muted">{s.resources.map((r) => `${data.locations.find((l) => l.id === r.locationId)?.name}: ${r.units} ${humanize(r.mode)}`).join(' · ') || 'No place reservation'}{s.maxAppointments ? ` · ${s.maxAppointments} appointment limit` : ''}</p><div className="mt-3 flex flex-wrap gap-2">{canEdit('service_session', context.permissions) ? <Button fullWidth={false} variant="outlined" disabled={data.pending.has(s.id)} onClick={() => setEditing({ kind: 'service_session', previous: s })}>Review / change session</Button> : null}{context.permissions.includes('service_session:operate') && s.status === 'published' ? <Button fullWidth={false} variant="outlined" onClick={() => setIntake(s)}>Manage intake</Button> : null}</div></article>; })}</div> : <Empty>No session is planned for this date. Walk-in intake, sign-in access and planned coverage are separate.</Empty>}
    {editing ? <RecordEditor {...editing} data={data} onClose={() => setEditing(undefined)} onSaved={query.reload} /> : null}{intake ? <IntakeEditor data={data} offeringId={intake.offeringId} session={intake} onClose={() => setIntake(undefined)} /> : null}
  </section>;
};
export const ServiceWorkspace = () => {
  const { offeringId } = useParams(), query = useWorkforce(), context = useAuthorizationContext(), [params, setParams] = useSearchParams(), [editing, setEditing] = useState<Edit>(), [intake, setIntake] = useState(false);
  if (query.loading || !query.data || query.error)
    return <WorkspaceLoading error={query.error} reload={query.reload} />;
  const data = query.data, offering = data.offerings.find((o) => o.id === offeringId), view = params.get('view') || 'overview';
  if (!offering)
    return <Empty>This service is not available on this device. Sync or return to <Link to="/facility?view=services" className="text-brand underline">Services</Link>.</Empty>;
  const assignments = currentFacilityRevisions(data.assignments).filter((a) => a.offeringId === offering.id), events = data.events.filter((e) => e.offeringId === offering.id && !e.sessionId);
  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-8"><Link to="/facility?view=services" className="inline-flex min-h-11 items-center text-sm font-bold text-brand">← Services</Link><header><h1 className="text-2xl font-extrabold">{offering.name}</h1><p className="mt-1 text-sm text-ink-muted">{unitPath(offering.unitId, data.units)} · {proposalState(offering, data)}</p></header><SectionTabs label="Service sections" value={view} onChange={(next) => setParams({ view: next })} options={[{ value: 'overview', label: 'Overview' }, { value: 'team', label: 'Team & coverage' }, { value: 'history', label: 'History' }]} />
    {view === 'overview' ? <><section className={panel}><dl className="grid gap-4 sm:grid-cols-2">{[['Patients accepted', humanize(offering.intakePolicy)], ['Delivery', humanize(offering.delivery)], ['Configuration', humanize(offering.configuration)], ['Equipment / supplies', humanize(offering.resourceReadiness)], ['Locations', offering.locationIds.map((id) => data.locations.find((l) => l.id === id)?.name || 'Unavailable place').join(', ') || 'No physical location'], ['Intake', intakeLabel(events,data)], ['Clinical activities', offering.requiredActions.map(humanize).join(', ') || 'None specified'], ['Timezone', offering.timeZone]].map(([label, value]) => <div key={label}><dt className="text-xs font-bold text-ink-muted">{label}</dt><dd className="mt-1 text-sm">{value}</dd></div>)}</dl><div className="mt-4 flex flex-wrap gap-2">{canEdit('service_offering', context.permissions) ? <Button fullWidth={false} variant="outlined" onClick={() => setEditing({ kind: 'service_offering', previous: offering })}>Edit service</Button> : null}{context.permissions.includes('service_session:operate')&&offering.intakePolicy!=='scheduled' ? <Button fullWidth={false} variant="outlined" onClick={() => setIntake(true)}>Manage walk-in intake</Button> : null}</div></section><p className="text-sm text-ink-muted">A configured service is not proof of equipment, available staff or an accepted reservation.</p></> : view === 'team' ? <><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-bold">Service assignments</h2>{canEdit('staff_assignment', context.permissions) ? <Button fullWidth={false} onClick={() => setEditing({ kind: 'staff_assignment', preset: { offeringId: offering.id } })}>Assign staff</Button> : null}</div><RecordList records={assignments} data={data} onEdit={canEdit('staff_assignment', context.permissions) ? (previous) => setEditing({ kind: 'staff_assignment', previous }) : undefined} detail={(a) => a.type === 'staff_assignment' ? `${data.staff.find((s) => s.staffId === a.staffId)?.fullName} · ${humanize(a.duty)} · ${showInterval(a.startsAt, a.endsAt, offering.timeZone)}` : ''} /><CoverageWorkspace offeringId={offering.id} embedded /></> : <RecordList records={[...data.assignments.filter((a) => a.offeringId === offering.id), ...data.sessions.filter((s) => s.offeringId === offering.id), ...data.events.filter((e) => e.offeringId === offering.id)].sort((a, b) => b.createdOn.localeCompare(a.createdOn))} data={data} detail={(r) => `${humanize(r.type)} · ${new Date(r.createdOn).toLocaleString('en-GB')} · ${data.staff.find((s) => s.staffId === r.createdBy)?.fullName || 'System'}`} />}
    {editing ? <RecordEditor {...editing} data={data} onClose={() => setEditing(undefined)} onSaved={query.reload} /> : null}{intake ? <IntakeEditor data={data} offeringId={offering.id} onClose={() => setIntake(false)} /> : null}
  </div>;
};
