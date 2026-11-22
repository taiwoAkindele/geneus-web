import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { currentFacilityRevisions, type AnyDocument, type ServiceSession } from '@shared';
import {
  Button,
  DataTable,
  SectionTabs,
  SelectField,
  Sheet,
  TextAreaField,
  TextField,
  Tag,
} from '@/ui';
import { useAuthorizationContext } from '@/session';
import { saveIntake, eventHeads, type WorkforceData } from '@/data/repos/workforce';
import { workforceReadiness } from '@/lib/api/workforce';
import { showInterval, zonedInput } from '@/lib/workforceTime';
import { RecordEditor } from './RecordEditor';
import { FacilityDetailsStep } from '@/modules/administration/setup/FacilityDetailsStep';
import { CareServicesStep } from '@/modules/administration/setup/CareServicesStep';
import type { EditorKind } from './editorFields';
import { useWorkforce } from './useWorkforce';
import {
  humanize,
  intakeLabel,
  placeDetail,
  proposalState,
  recordName,
  unitPath,
} from './presentation';

export const WorkspaceLoading = ({ error, reload }: { error?: Error; reload: () => void }) =>
  error ? (
    <div role="alert" className="m-5 rounded-card border border-danger p-5">
      <p>{error.message}</p>
      <Button variant="outlined" onClick={reload}>
        Try again
      </Button>
    </div>
  ) : (
    <div
      role="status"
      className="m-5 h-40 animate-pulse rounded-card bg-surface-muted"
      aria-label="Reading facility records"
    />
  );

const Empty = ({ children }: { children: ReactNode }) => (
  <div className="rounded-card border border-dashed border-outline bg-white p-6 text-sm text-ink-muted">
    {children}
  </div>
);

const panel = 'rounded-card border border-outline-soft bg-white p-4 md:p-5';
type Edit = {
  kind: EditorKind;
  previous?: AnyDocument;
  preset?: Record<string, unknown>;
};

const canEdit = (kind: EditorKind, permissions: readonly string[]) =>
  permissions.includes(
    (
      {
        unit: 'unit:manage',
        location: 'location:manage',
        service_definition: 'service:manage',
        service_offering: 'service:manage',
        practitioner_profile: 'practitioner:manage',
        staff_assignment: 'staff_assignment:manage',
        service_session: 'service_session:manage',
        billing_department: 'fee_item:manage',
        credential: 'credential:manage',
        capability_decision: 'clinical_capability:review',
        reviewer_delegation: 'clinical_capability:review',
      } as Record<EditorKind, string>
    )[kind],
  );

const lifecycle = (r: AnyDocument): string => {
  if ('active' in r) {
    return r.active ? 'Available' : 'Retired';
  }

  if ('status' in r) {
    return humanize(String(r.status));
  }

  if ('configuration' in r) {
    return humanize(String(r.configuration));
  }

  return '';
};

/** Plain business status: sync state is shown only when something needs the reader. */
const businessState = (r: AnyDocument, data: WorkforceData) => {
  const sync = proposalState(r, data);

  if (sync === 'Needs reconciliation') {
    return <Tag tone="danger">Needs attention</Tag>;
  }

  if (data.pending.has(r.id)) {
    return <Tag tone="amber">Saving</Tag>;
  }

  const state = lifecycle(r);

  return (
    <Tag tone={state === 'Retired' ? 'neutral' : 'green'}>
      {state === 'Available' ? 'Active' : state}
    </Tag>
  );
};

/** The facility pages that list one kind of record: teams, places or financial departments. */
type RecordView = 'structure' | 'locations' | 'departments';

const recordViewFor = (view: string): RecordView => {
  if (view === 'structure' || view === 'locations') {
    return view;
  }

  return 'departments';
};

const RECORD_VIEW_COPY: Record<
  RecordView,
  {
    kind: EditorKind;
    title: string;
    intro: string;
    noun: string;
    findLabel: string;
    empty: string;
  }
> = {
  structure: {
    kind: 'unit',
    title: 'Teams & units',
    intro: 'The teams responsible for care. Group units under departments when you need to.',
    noun: 'team',
    findLabel: 'Find a team',
    empty: 'No teams yet. Add the team responsible for care.',
  },
  locations: {
    kind: 'location',
    title: 'Places & beds',
    intro: 'The rooms, wards, beds and stores where care happens.',
    noun: 'place',
    findLabel: 'Find a place',
    empty: 'No places yet. Add a room, ward, bed or store.',
  },
  departments: {
    kind: 'billing_department',
    title: 'Financial team links',
    intro:
      'Connect billing departments to responsible teams. Manage fees and payment accounts in Billing.',
    noun: 'financial department',
    findLabel: 'Find a financial department',
    empty: 'No financial departments yet.',
  },
};

const facilityRecordDetail = (r: AnyDocument, data: WorkforceData): string => {
  if (r.type === 'unit') {
    const classification = r.kind ? humanize(r.kind) : 'Classification needed';

    return `${classification} · ${unitPath(r.id, data.units)}`;
  }

  if (r.type === 'location') {
    return placeDetail(r, data.locations);
  }

  if (r.type === 'billing_department') {
    if (r.organizationUnitId) {
      return unitPath(r.organizationUnitId, data.units);
    }

    return 'Not yet linked';
  }

  return '';
};

/** Intake can be opened when closed or never opened, resumed when paused, and paused or closed when open. */
const intakeActions = (previous?: { action: string }): string[] => {
  if (!previous || previous.action === 'close') {
    return ['open'];
  }

  if (previous.action === 'pause') {
    return ['resume', 'close'];
  }

  return ['pause', 'close'];
};

export const RecordList = ({
  records,
  data,
  onEdit,
  detail,
  businessStatus = false,
}: {
  records: AnyDocument[];
  data: WorkforceData;
  onEdit?: (record: AnyDocument) => void;
  detail?: (record: AnyDocument) => ReactNode;
  /** Show Active/Retired/Needs attention instead of the server-acceptance state. */
  businessStatus?: boolean;
}) =>
  records.length ? (
    <DataTable
      caption="Facility records"
      rows={records}
      rowKey={(r) => r.id}
      columns={[
        {
          key: 'name',
          label: 'Name',
          sortValue: recordName,
          render: (r) => (
            <div className="min-w-[120px]">
              <p className="font-bold">
                {r.type === 'service_offering' ? (
                  <Link
                    className="text-brand underline"
                    to={`/facility/services/${encodeURIComponent(r.id)}`}
                  >
                    {r.name}
                  </Link>
                ) : (
                  recordName(r)
                )}
              </p>
              <p className="mt-1 text-xs text-ink-muted">{detail?.(r)}</p>
            </div>
          ),
        },
        {
          key: 'state',
          label: businessStatus ? 'Status' : 'State',
          render: (r) =>
            businessStatus ? (
              businessState(r, data)
            ) : (
              <div className="space-y-1">
                <Tag tone={data.pending.has(r.id) ? 'amber' : 'neutral'}>
                  {proposalState(r, data)}
                </Tag>
                <p className="text-xs">{lifecycle(r)}</p>
              </div>
            ),
        },
        {
          key: 'action',
          label: 'Action',
          render: (r) =>
            onEdit ? (
              <Button
                fullWidth={false}
                variant="outlined"
                disabled={data.pending.has(r.id)}
                onClick={() => onEdit(r)}
              >
                Review / edit
              </Button>
            ) : (
              <span className="text-xs text-ink-muted">View only</span>
            ),
        },
      ]}
    />
  ) : (
    <Empty>
      No records match this view. Add the actual service, team or place when you are ready.
    </Empty>
  );

const Readiness = () => {
  const context = useAuthorizationContext();

  const [result, setResult] = useState<{
    ready: boolean;
    blockers: {
      kind: string;
      ids: string[];
    }[];
  }>();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const check = async () => {
    if (busy) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      setResult(await workforceReadiness(context));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Readiness could not be checked');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={panel}>
      <h2 className="font-bold">Clinical approval rollout</h2>
      <p className="my-2 text-sm text-ink-muted">
        Your authorized facility lead reviews services, professional approvals and upgraded devices
        before clinical enforcement is activated. Saving setup does not activate it.
      </p>
      <Button fullWidth={false} variant="outlined" loading={busy} onClick={() => void check()}>
        Check readiness online
      </Button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      {result ? (
        <div className="mt-3 text-sm" role="status">
          <p className="font-bold">
            {result.ready
              ? 'Ready for the authorized rollout review'
              : 'Items to complete before activation'}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {result.blockers.map((b) => (
              <li key={b.kind}>
                {humanize(b.kind)} · {b.ids.length}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};

export const FacilityWorkspace = () => {
  const query = useWorkforce();
  const context = useAuthorizationContext();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Edit>();
  // Keep bookmarked sections working after simplifying the navigation.
  const requested = params.get('view');

  const view =
    requested && ['services', 'structure', 'locations', 'finance', 'advanced'].includes(requested)
      ? requested
      : 'details';

  useEffect(() => {
    document.title = 'Facility · Geneus Health';
  }, []);

  if (query.loading || !query.data) {
    return <WorkspaceLoading error={query.error} reload={query.reload} />;
  }

  if (query.error) {
    return <WorkspaceLoading error={query.error} reload={query.reload} />;
  }

  const data = query.data;
  const advanced = view === 'advanced' || view === 'finance';
  const recordView = recordViewFor(view);
  const copy = RECORD_VIEW_COPY[recordView];
  const kind = copy.kind;

  const collectionFor = () => {
    if (recordView === 'structure') {
      return data.units;
    }

    if (recordView === 'locations') {
      return data.locations;
    }

    return data.departments;
  };

  const collection = collectionFor();

  const records = collection.filter((r) =>
    recordName(r).toLowerCase().includes(search.toLowerCase()),
  );

  const change = (next: string) => {
    setSearch('');
    setParams({ view: next });
  };

  const recordSection = (
    <section className={`${panel} min-w-0 space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">{copy.title}</h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">{copy.intro}</p>
        </div>
        {canEdit(kind, context.permissions) ? (
          <Button fullWidth={false} onClick={() => setEditing({ kind })}>
            Add {copy.noun}
          </Button>
        ) : null}
      </div>
      <TextField
        label={copy.findLabel}
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {records.length ? (
        <RecordList
          businessStatus
          records={records}
          data={data}
          onEdit={
            canEdit(kind, context.permissions)
              ? (previous) => setEditing({ kind, previous })
              : undefined
          }
          detail={(r) => facilityRecordDetail(r, data)}
        />
      ) : (
        <Empty>{search ? 'No matches. Try another name.' : copy.empty}</Empty>
      )}
    </section>
  );

  const renderView = () => {
    if (view === 'details') {
      return (
        <section aria-labelledby="facility-details-heading" className={`${panel} space-y-4`}>
          <div>
            <h3 id="facility-details-heading" className="text-lg font-bold">
              Facility details
            </h3>
            <p className="mt-1 text-sm text-ink-muted">
              Your facility name, address, contact details and local preferences.
            </p>
          </div>
          <FacilityDetailsStep mode="settings" />
        </section>
      );
    }

    if (view === 'services') {
      return (
        <section className={`${panel} space-y-4`}>
          <p className="text-sm text-ink-muted">
            The same care services you chose during setup. Each service has a responsible team and a
            place.
          </p>
          <CareServicesStep mode="settings" />
        </section>
      );
    }

    if (advanced) {
      return (
        <div className="space-y-4">
          {recordSection}
          {context.permissions.includes('staff:manage') ? (
            <details className={panel}>
              <summary className="min-h-11 cursor-pointer py-2 font-bold">
                Clinical approval rollout
              </summary>
              <div className="mt-3">
                <Readiness />
              </div>
            </details>
          ) : null}
          <Link
            to="/billing/prices"
            className="inline-flex min-h-11 items-center text-sm font-bold text-brand underline"
          >
            Open prices
          </Link>
        </div>
      );
    }

    return recordSection;
  };

  return (
    <section aria-labelledby="facility-heading" className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="facility-heading" className="text-xl font-extrabold">
            Facility
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            Manage your facility details, the care you provide and where it happens.
          </p>
        </div>
        <Link
          to="/setup"
          className="inline-flex min-h-11 items-center text-sm font-bold text-brand underline"
        >
          Open setup guide
        </Link>
      </header>
      <SectionTabs
        label="Facility sections"
        value={advanced ? 'advanced' : view}
        onChange={change}
        options={[
          { value: 'details', label: 'Details' },
          { value: 'services', label: 'Care services' },
          { value: 'structure', label: 'Teams & units' },
          { value: 'locations', label: 'Places & beds' },
          { value: 'advanced', label: 'Advanced' },
        ]}
      />
      {renderView()}
      {editing ? (
        <RecordEditor
          key={`${editing.kind}:${editing.previous?.id || 'new'}`}
          {...editing}
          data={data}
          onClose={() => setEditing(undefined)}
          onSaved={query.reload}
        />
      ) : null}
    </section>
  );
};

const IntakeEditor = ({
  data,
  offeringId,
  session,
  onClose,
}: {
  data: WorkforceData;
  offeringId: string;
  session?: ServiceSession;
  onClose: () => void;
}) => {
  const context = useAuthorizationContext();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const heads = eventHeads(
    data.events.filter((e) => e.offeringId === offeringId && e.sessionId === session?.sessionId),
  );

  const previous = heads[0];
  const available = intakeActions(previous);
  const [action, setAction] = useState(available[0]);

  return (
    <Sheet
      title="Change service intake"
      placement="side"
      onClose={onClose}
      closeDisabled={busy}
      hasUnsavedChanges={Boolean(reason)}
    >
      <p className="mb-4 text-sm text-ink-muted">
        This changes acceptance of new work. Existing patient instructions and bookings remain
        visible.
      </p>
      <SelectField
        label="Intake action"
        value={action}
        onChange={(e) => setAction(e.target.value)}
        options={available.map((value) => ({ value, label: humanize(value) }))}
      />
      <TextAreaField
        label="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        help={{ purpose: 'Pause and closure require an explanation for other staff.' }}
      />
      {error ? (
        <p role="alert" className="my-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button
        className="mt-4"
        loading={busy}
        disabled={busy || heads.length > 1}
        onClick={async () => {
          setBusy(true);

          try {
            await saveIntake(
              offeringId,
              session?.sessionId,
              action as 'open',
              reason,
              context,
              previous,
            );

            onClose();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not change intake');
          } finally {
            setBusy(false);
          }
        }}
      >
        Confirm intake proposal
      </Button>
    </Sheet>
  );
};

export const CoverageWorkspace = ({
  offeringId,
  embedded = false,
}: {
  offeringId?: string;
  embedded?: boolean;
}) => {
  const query = useWorkforce();
  const context = useAuthorizationContext();
  const [params, setParams] = useSearchParams();

  const [date, setDate] = useState(
    params.get('date') || zonedInput(new Date().toISOString(), 'Africa/Lagos').slice(0, 10),
  );

  const [service, setService] = useState(offeringId || '');
  const [editing, setEditing] = useState<Edit>();
  const [intake, setIntake] = useState<ServiceSession>();

  if (query.loading || !query.data || query.error) {
    return <WorkspaceLoading error={query.error} reload={query.reload} />;
  }

  const data = query.data;

  const sessions = currentFacilityRevisions(data.sessions)
    .filter(
      (s) =>
        (!service || s.offeringId === service) &&
        zonedInput(s.startsAt, s.timeZone).slice(0, 10) <= date &&
        zonedInput(new Date(Date.parse(s.endsAt) - 1).toISOString(), s.timeZone).slice(0, 10) >=
          date,
    )
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  // Not embedded: Settings → Staff scheduling & coverage, which provides the page heading and sections.
  return (
    <section className={embedded ? 'space-y-4' : 'space-y-5'}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <TextField
            label="Coverage date"
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);

              if (!embedded) {
                const next = new URLSearchParams(params);
                next.set('date', e.target.value);
                setParams(next);
              }
            }}
          />
        </div>
        {!offeringId ? (
          <div className="min-w-48 flex-1">
            <SelectField
              label="Service"
              value={service}
              onChange={(e) => setService(e.target.value)}
              options={[
                { value: '', label: 'All services' },
                ...data.offerings.map((o) => ({ value: o.id, label: o.name })),
              ]}
            />
          </div>
        ) : null}
        {canEdit('service_session', context.permissions) ? (
          <Button
            fullWidth={false}
            onClick={() =>
              setEditing({ kind: 'service_session', preset: { offeringId: service || undefined } })
            }
          >
            Add session
          </Button>
        ) : null}
      </div>
      <p className="text-sm text-ink-muted">
        Planned coverage is separate from opened intake and attendance. Overnight sessions show both
        dates. On-call cover is not a claim of physical presence.
      </p>
      {sessions.length ? (
        <div className="space-y-3">
          {sessions.map((s) => {
            const events = data.events.filter(
              (e) => e.offeringId === s.offeringId && e.sessionId === s.sessionId,
            );

            return (
              <article key={s.id} className={panel}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-bold">
                      {data.offerings.find((o) => o.id === s.offeringId)?.name ||
                        'Service unavailable'}
                    </h2>
                    <p className="mt-1 text-sm">{showInterval(s.startsAt, s.endsAt, s.timeZone)}</p>
                  </div>
                  <Tag>{humanize(s.status)}</Tag>
                </div>
                <p className="my-2 text-sm text-ink-muted">
                  {s.participants
                    .map(
                      (p) =>
                        `${data.staff.find((person) => person.staffId === p.staffId)?.fullName || 'Staff unavailable'} (${humanize(p.commitment)})`,
                    )
                    .join(', ')}
                </p>
                <p className="text-sm">
                  Intake: {intakeLabel(events, data)} · {proposalState(s, data)}
                </p>
                <p className="mt-2 text-xs text-ink-muted">
                  {s.resources
                    .map(
                      (r) =>
                        `${data.locations.find((l) => l.id === r.locationId)?.name}: ${r.units} ${humanize(r.mode)}`,
                    )
                    .join(' · ') || 'No place reservation'}
                  {s.maxAppointments ? ` · ${s.maxAppointments} appointment limit` : ''}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {canEdit('service_session', context.permissions) ? (
                    <Button
                      fullWidth={false}
                      variant="outlined"
                      disabled={data.pending.has(s.id)}
                      onClick={() => setEditing({ kind: 'service_session', previous: s })}
                    >
                      Review / change session
                    </Button>
                  ) : null}
                  {context.permissions.includes('service_session:operate') &&
                  s.status === 'published' ? (
                    <Button fullWidth={false} variant="outlined" onClick={() => setIntake(s)}>
                      Manage intake
                    </Button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty>
          No session is planned for this date. Walk-in intake, sign-in access and planned coverage
          are separate.
        </Empty>
      )}
      {editing ? (
        <RecordEditor
          {...editing}
          data={data}
          onClose={() => setEditing(undefined)}
          onSaved={query.reload}
        />
      ) : null}
      {intake ? (
        <IntakeEditor
          data={data}
          offeringId={intake.offeringId}
          session={intake}
          onClose={() => setIntake(undefined)}
        />
      ) : null}
    </section>
  );
};

export const ServiceWorkspace = () => {
  const { offeringId } = useParams();
  const query = useWorkforce();
  const context = useAuthorizationContext();
  const [params, setParams] = useSearchParams();
  const [editing, setEditing] = useState<Edit>();
  const [intake, setIntake] = useState(false);

  if (query.loading || !query.data || query.error) {
    return <WorkspaceLoading error={query.error} reload={query.reload} />;
  }

  const data = query.data;
  const offering = data.offerings.find((o) => o.id === offeringId);
  const view = params.get('view') || 'overview';

  if (!offering) {
    return (
      <Empty>
        This service is not available on this device. Sync or return to{' '}
        <Link to="/facility?view=services" className="text-brand underline">
          Services
        </Link>
        .
      </Empty>
    );
  }

  const assignments = currentFacilityRevisions(data.assignments).filter(
    (a) => a.offeringId === offering.id,
  );

  const events = data.events.filter((e) => e.offeringId === offering.id && !e.sessionId);

  const renderView = () => {
    if (view === 'overview') {
      return (
        <>
          <section className={panel}>
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ['Patients accepted', humanize(offering.intakePolicy)],
                ['Delivery', humanize(offering.delivery)],
                ['Configuration', humanize(offering.configuration)],
                ['Equipment / supplies', humanize(offering.resourceReadiness)],
                [
                  'Locations',
                  offering.locationIds
                    .map(
                      (id) => data.locations.find((l) => l.id === id)?.name || 'Unavailable place',
                    )
                    .join(', ') || 'No physical location',
                ],
                ['Intake', intakeLabel(events, data)],
                [
                  'Clinical activities',
                  offering.requiredActions.map(humanize).join(', ') || 'None specified',
                ],
                ['Timezone', offering.timeZone],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-bold text-ink-muted">{label}</dt>
                  <dd className="mt-1 text-sm">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {canEdit('service_offering', context.permissions) ? (
                <Button
                  fullWidth={false}
                  variant="outlined"
                  onClick={() => setEditing({ kind: 'service_offering', previous: offering })}
                >
                  Edit service
                </Button>
              ) : null}
              {context.permissions.includes('service_session:operate') &&
              offering.intakePolicy !== 'scheduled' ? (
                <Button fullWidth={false} variant="outlined" onClick={() => setIntake(true)}>
                  Manage walk-in intake
                </Button>
              ) : null}
            </div>
          </section>
          <p className="text-sm text-ink-muted">
            A configured service is not proof of equipment, available staff or an accepted
            reservation.
          </p>
        </>
      );
    }

    if (view === 'team') {
      return (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Service assignments</h2>
            {canEdit('staff_assignment', context.permissions) ? (
              <Button
                fullWidth={false}
                onClick={() =>
                  setEditing({ kind: 'staff_assignment', preset: { offeringId: offering.id } })
                }
              >
                Assign staff
              </Button>
            ) : null}
          </div>
          <RecordList
            records={assignments}
            data={data}
            onEdit={
              canEdit('staff_assignment', context.permissions)
                ? (previous) => setEditing({ kind: 'staff_assignment', previous })
                : undefined
            }
            detail={(a) =>
              a.type === 'staff_assignment'
                ? `${data.staff.find((s) => s.staffId === a.staffId)?.fullName} · ${humanize(a.duty)} · ${showInterval(a.startsAt, a.endsAt, offering.timeZone)}`
                : ''
            }
          />
          <CoverageWorkspace offeringId={offering.id} embedded />
        </>
      );
    }

    return (
      <RecordList
        records={[
          ...data.assignments.filter((a) => a.offeringId === offering.id),
          ...data.sessions.filter((s) => s.offeringId === offering.id),
          ...data.events.filter((e) => e.offeringId === offering.id),
        ].sort((a, b) => b.createdOn.localeCompare(a.createdOn))}
        data={data}
        detail={(r) =>
          `${humanize(r.type)} · ${new Date(r.createdOn).toLocaleString('en-GB')} · ${data.staff.find((s) => s.staffId === r.createdBy)?.fullName || 'System'}`
        }
      />
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-8">
      <Link
        to="/facility?view=services"
        className="inline-flex min-h-11 items-center text-sm font-bold text-brand"
      >
        ← Services
      </Link>
      <header>
        <h1 className="text-2xl font-extrabold">{offering.name}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {unitPath(offering.unitId, data.units)} · {proposalState(offering, data)}
        </p>
      </header>
      <SectionTabs
        label="Service sections"
        value={view}
        onChange={(next) => setParams({ view: next })}
        options={[
          { value: 'overview', label: 'Overview' },
          { value: 'team', label: 'Team & coverage' },
          { value: 'history', label: 'History' },
        ]}
      />
      {renderView()}
      {editing ? (
        <RecordEditor
          {...editing}
          data={data}
          onClose={() => setEditing(undefined)}
          onSaved={query.reload}
        />
      ) : null}
      {intake ? (
        <IntakeEditor data={data} offeringId={offering.id} onClose={() => setIntake(false)} />
      ) : null}
    </div>
  );
};
