import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { ServiceDefinition, Staff } from '@shared';
import { moduleSettingsFor } from '@/app/moduleSettings';
import { useLiveQuery, useSyncStatus } from '@/data';
import { allOfType } from '@/data/db';
import { laboratoryDraftEncounters } from '@/data/repos/drafts';
import { pendingWorkforceIds } from '@/data/repos/workforce';
import { listOpenRejections } from '@/data/repos/syncRejections';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, Tag, TextField } from '@/ui';
import { usePatients } from '@/modules/front-desk/search';
import { useRequestQueues, visitDate, type ServiceRequest } from '@/modules/clinical/encounter';
import { labRequestPath } from './LabRequestScreen';

const pageSize = 25;

const waitLabel = (requestedOn: string, now: number) => {
  const minutes = Math.max(0, Math.floor((now - Date.parse(requestedOn)) / 60_000));

  if (minutes < 60) {
    return `${minutes} min waiting`;
  }

  const hours = Math.floor(minutes / 60);
  return hours >= 24
    ? `${Math.floor(hours / 24)}d ${hours % 24}h waiting`
    : `${hours}h ${minutes % 60}m waiting`;
};

const loadLabDisplayData = async () => {
  const [definitions, staff] = await Promise.all([
    allOfType<ServiceDefinition>('service_definition'),
    allOfType<Staff>('staff'),
  ]);
  return {
    departments: new Map(
      definitions.flatMap((definition) =>
        definition.investigation?.department
          ? [[definition.id, definition.investigation.department] as const]
          : [],
      ),
    ),
    staff: new Map(staff.map((member) => [member.staffId, member.fullName])),
  };
};

const progress = (request: ServiceRequest, hasDraft: boolean) => {
  if (!request.pending.length) {
    return <Tag tone="green">Resulted</Tag>;
  }

  if (hasDraft) {
    return <Tag tone="amber">Draft saved</Tag>;
  }

  return (
    <Tag>
      {request.pending.length === request.items.length
        ? 'Awaiting results'
        : `${request.items.length - request.pending.length} of ${request.items.length} resulted`}
    </Tag>
  );
};

const loadResultDelivery = async () => {
  const [pending, rejected] = await Promise.all([pendingWorkforceIds(), listOpenRejections()]);
  return {
    pending,
    rejected: new Set(
      rejected.filter((row) => row.entityType === 'encounter_entry').map((row) => row.entityId),
    ),
  };
};

export const LaboratoryWorklist = () => {
  const context = useAuthorizationContext();
  const settings = moduleSettingsFor('laboratory', context);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const display = useLiveQuery(loadLabDisplayData, ['service_definition', 'staff']);
  const requests = useRequestQueues();
  const patients = usePatients();
  const drafts = useLiveQuery(
    useCallback(() => laboratoryDraftEncounters(context.userId), [context.userId]),
  );
  const sync = useSyncStatus();
  const delivery = useLiveQuery(loadResultDelivery, ['sync_rejection']);
  const reloadDelivery = delivery.reload;
  useEffect(() => reloadDelivery(), [reloadDelivery, sync.pending, sync.lastSyncedAt]);
  const [now, setNow] = useState(Date.now);
  const [selected, setSelected] = useState<string>();
  const [mobileDetail, setMobileDetail] = useState(false);
  const tab = params.get('tab');
  const results = tab === 'completed';
  const billing = tab === 'pricing';
  const open = requests.data?.lab.open ?? [];
  const completed = requests.data?.lab.completed ?? [];
  const query = params.get('q') ?? '';
  const filter = params.get('filter') ?? '';
  const section = params.get('section') ?? '';
  const page = Math.max(0, Math.trunc(Number(params.get('page')) || 0));
  const people = useMemo(
    () => new Map((patients.data ?? []).map((patient) => [patient.patientId, patient])),
    [patients.data],
  );
  const sections = [...new Set(display.data?.departments.values() ?? [])].sort();
  const hasDraft = (request: ServiceRequest) => drafts.data?.has(request.encounterId) ?? false;
  const hasSection = (request: ServiceRequest) =>
    request.investigations?.some(
      (item) =>
        item.serviceDefinitionId &&
        display.data?.departments.get(item.serviceDefinitionId) === section,
    );

  useEffect(() => {
    document.title = 'Laboratory · Geneus Health';
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    if (key !== 'page') {
      next.delete('page');
    }
    setParams(next, { replace: true });
    setMobileDetail(false);
  };

  let source = open;
  let listHeading = 'Open requests';
  if (results) {
    source = completed;
    listHeading = 'Published results';
  } else if (billing) {
    source = [...open, ...completed].filter((request) => request.billingPending);
    listHeading = 'Billing review';
  }
  const visible = source.filter((request) => {
    const person = people.get(request.patientId);
    const matchesSearch = [person?.fullName, request.patientId, ...request.items].some((label) =>
      label?.toLowerCase().includes(query.trim().toLowerCase()),
    );
    return (
      matchesSearch &&
      (!section || hasSection(request)) &&
      (results ||
        billing ||
        ((filter !== 'urgent' || request.urgent) && (filter !== 'draft' || hasDraft(request))))
    );
  });
  const rows = visible.slice(page * pageSize, (page + 1) * pageSize);
  const detail = rows.find((request) => request.id === selected) ?? rows[0];
  let requestAction = 'Open request';
  if (results || detail?.superseded) {
    requestAction = 'View report';
  } else if (detail && hasDraft(detail)) {
    requestAction = 'Resume result draft';
  }

  const openRequest = (request: ServiceRequest) => {
    const route = request.superseded
      ? `/encounters/record?${new URLSearchParams({ patient: request.patientId, visit: request.encounterId })}`
      : labRequestPath(request.patientId, request.encounterId);
    navigate(route, {
      state: { laboratoryReturn: `/laboratory${params.size ? `?${params}` : ''}` },
    });
  };

  const deliveryLabel = (request: ServiceRequest) => {
    const ids = request.resultEntryIds ?? [];

    if (ids.some((id) => delivery.data?.rejected.has(id))) {
      return <Tag tone="amber">Sync needs review</Tag>;
    }

    if (ids.some((id) => delivery.data?.pending.has(id))) {
      return <Tag tone="amber">Awaiting sync</Tag>;
    }

    return ids.length && delivery.data && sync.hasSynced ? (
      <Tag tone="green">Synced</Tag>
    ) : (
      <Tag>Published</Tag>
    );
  };

  return (
    <div className="mx-auto max-w-screen-2xl space-y-5 px-4 py-5 md:px-8">
      <header>
        <h1 className="text-[28px] font-extrabold">Laboratory</h1>
        <nav
          aria-label="Laboratory navigation"
          className="mt-2 flex flex-wrap gap-x-3 border-b border-outline-soft text-sm font-bold text-brand"
        >
          <Link
            to="/laboratory"
            aria-current={!results && !billing ? 'page' : undefined}
            className="inline-flex min-h-[44px] items-center px-2 aria-[current=page]:border-b-2 aria-[current=page]:border-brand"
          >
            Worklist
          </Link>
          <Link
            to="/laboratory?tab=completed"
            aria-current={results ? 'page' : undefined}
            className="inline-flex min-h-[44px] items-center px-2 aria-[current=page]:border-b-2 aria-[current=page]:border-brand"
          >
            Results
          </Link>
          {settings.pages.some(({ key }) => key === 'tests') ? (
            <Link
              className="inline-flex min-h-[44px] items-center px-2"
              to="/laboratory/settings/tests"
            >
              Test catalogue
            </Link>
          ) : null}
          {context.permissions.includes('result_template:manage') ? (
            <Link
              className="inline-flex min-h-[44px] items-center px-2"
              to="/laboratory/settings/templates"
            >
              Result templates
            </Link>
          ) : null}
        </nav>
      </header>
      {!results && !billing ? (
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: '', label: 'Open requests', count: open.length },
            {
              key: 'urgent',
              label: 'Urgent',
              count: open.filter((request) => request.urgent).length,
            },
            { key: 'draft', label: 'Drafts to resume', count: open.filter(hasDraft).length },
          ].map(({ key, label, count }) => (
            <button
              key={label}
              type="button"
              aria-pressed={filter === key}
              onClick={() => update('filter', key)}
              className="rounded-card border border-outline-soft bg-white p-2 text-left text-sm font-semibold aria-pressed:border-brand aria-pressed:bg-brand-wash sm:p-4"
            >
              <strong className="block text-2xl font-extrabold">{count}</strong>
              {label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <section
          className={`${mobileDetail && detail ? 'hidden xl:block' : ''} min-w-0 rounded-card border border-outline-soft bg-white`}
          aria-label={results ? 'Published results' : 'Laboratory requests'}
        >
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-extrabold">{listHeading}</h2>
              <span className="text-xs text-ink-soft">
                {visible.length} shown{!results && !billing ? ' · Urgent first' : ''}
              </span>
            </div>
            <div className="grid items-end gap-2 md:grid-cols-[1fr_200px]">
              <TextField
                label="Search"
                type="search"
                placeholder="Patient name, ID or test"
                value={query}
                onChange={(event) => update('q', event.target.value)}
              />
              <SelectField
                label="Lab section"
                value={section}
                options={[
                  { value: '', label: 'All sections' },
                  ...sections.map((name) => ({ value: name, label: name })),
                ]}
                onChange={(event) => update('section', event.target.value)}
              />
            </div>
          </div>
          {requests.loading || patients.loading ? (
            <p className="p-4" role="status">
              Reading requests…
            </p>
          ) : null}
          {requests.error || patients.error ? (
            <p className="p-4 text-danger-strong" role="alert">
              Requests could not be read.{' '}
              <Button
                variant="ghost"
                fullWidth={false}
                onClick={() => {
                  requests.reload();
                  patients.reload();
                }}
              >
                Try again
              </Button>
            </p>
          ) : null}
          {!requests.loading && !requests.error && !rows.length ? (
            <p className="p-4 text-ink-soft">No requests match this view.</p>
          ) : null}
          <ul className="divide-y divide-outline-soft border-t border-outline-soft">
            {rows.map((request) => (
              <li key={request.id} className={request.id === detail?.id ? 'bg-brand-wash' : ''}>
                <button
                  type="button"
                  aria-current={request.id === detail?.id ? 'true' : undefined}
                  className="grid w-full gap-2 p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand md:grid-cols-[1fr_1fr_135px]"
                  onClick={() => {
                    setSelected(request.id);
                    setMobileDetail(true);
                  }}
                >
                  <span className="min-w-0">
                    <span className="block font-extrabold text-brand">
                      {people.get(request.patientId)?.fullName ?? 'Patient not on this device'}
                    </span>
                    <span className="break-all text-xs text-ink-soft">{request.patientId}</span>
                  </span>
                  <span className="min-w-0 text-sm">
                    <span className="block break-words font-semibold">
                      {request.items.join(', ')}
                    </span>
                    <span className="text-xs text-ink-soft">
                      {visitDate(request.completedOn ?? request.requestedOn)}
                      {!results && !billing ? ` · ${waitLabel(request.requestedOn, now)}` : ''}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-start gap-1">
                    {results ? deliveryLabel(request) : progress(request, hasDraft(request))}
                    {request.urgent && !results ? <Tag tone="amber">Urgent</Tag> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {visible.length > pageSize ? (
            <div className="flex justify-between p-3">
              <Button
                variant="outlined"
                fullWidth={false}
                disabled={page === 0}
                onClick={() => update('page', String(page - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outlined"
                fullWidth={false}
                disabled={(page + 1) * pageSize >= visible.length}
                onClick={() => update('page', String(page + 1))}
              >
                Next
              </Button>
            </div>
          ) : null}
        </section>
        {detail ? (
          <aside
            aria-label="Selected request"
            className={`${mobileDetail ? 'block' : 'hidden xl:block'} min-w-0 space-y-3 rounded-card border border-outline-soft bg-white p-4`}
          >
            <Button
              className="xl:hidden"
              variant="ghost"
              fullWidth={false}
              onClick={() => setMobileDetail(false)}
            >
              Back to requests
            </Button>
            <div>
              <h2 className="text-lg font-extrabold">
                {people.get(detail.patientId)?.fullName ?? 'Request details'}
              </h2>
              <p className="break-all text-xs text-ink-soft">{detail.patientId}</p>
            </div>
            <ul className="space-y-2">
              {detail.items.map((name, index) => (
                <li className="text-sm" key={`${name}-${index}`}>
                  <p className="font-bold">{name}</p>
                  {detail.investigations?.[index]?.specimen ? (
                    <p className="text-ink-soft">{detail.investigations[index].specimen}</p>
                  ) : null}
                </li>
              ))}
            </ul>
            <dl className="grid gap-2 border-y border-outline-soft py-3 text-sm">
              <div>
                <dt className="text-ink-soft">Requested</dt>
                <dd>{visitDate(detail.requestedOn)}</dd>
              </div>
              {detail.requestedBy && display.data?.staff.has(detail.requestedBy) ? (
                <div>
                  <dt className="text-ink-soft">Requested by</dt>
                  <dd>{display.data.staff.get(detail.requestedBy)}</dd>
                </div>
              ) : null}
            </dl>
            <div className="flex flex-wrap gap-2">
              {results ? deliveryLabel(detail) : progress(detail, hasDraft(detail))}
              {detail.urgent && !results ? <Tag tone="amber">Urgent</Tag> : null}
            </div>
            {detail.billingPending ? (
              <p className="rounded-field bg-amber-bg p-3 text-sm text-amber-text">
                Billing review pending. Clinical work can continue.
              </p>
            ) : null}
            <Button onClick={() => openRequest(detail)}>{requestAction}</Button>
          </aside>
        ) : null}
      </div>
    </div>
  );
};
