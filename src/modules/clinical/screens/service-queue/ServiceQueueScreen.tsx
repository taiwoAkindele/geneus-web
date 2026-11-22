import { CatalogueBrowser } from '@/modules/finance/billing';
import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthorizationContext } from '@/session';
import { Button, DataTable, Icon, SectionTabs, Tag, type TableColumn } from '@/ui';
import { usePatients } from '@/modules/front-desk/search';
import { useRequestQueues, type ServiceRequest, visitDate } from '@/modules/clinical/encounter';
import { PatientChartAccess } from '@/modules/front-desk/patients';
import { labRequestPath } from './LabRequestScreen';
import { dispensePath } from './DispenseScreen';
import { ModuleSettingsMenu } from '@/app/ModuleSettingsMenu';

type Station = 'lab' | 'pharmacy';
const COPY = {
  lab: {
    title: 'Laboratory',
    items: 'Tests',
    search: 'Patient name, ID or test',
    open: 'Record results',
    empty: 'No test requests',
  },
  pharmacy: {
    title: 'Pharmacy',
    items: 'Medicines',
    search: 'Patient name, ID or medicine',
    open: 'Dispense',
    empty: 'No prescriptions',
  },
} as const;

type QueueTab = 'open' | 'completed' | 'catalogue' | 'pricing';

const queueTabFor = (requested: string | null): QueueTab => {
  if (requested === 'catalogue' || requested === 'pricing' || requested === 'completed') {
    return requested;
  }

  return 'open';
};

/** One service's requests: open until resulted or dispensed, then completed. Only a search narrows them. */
export const ServiceQueueScreen = ({ station }: { station: Station }) => (
  <PatientChartAccess>
    <ServiceQueue station={station} />
  </PatientChartAccess>
);

const ServiceQueue = ({ station }: { station: Station }) => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const copy = COPY[station];
  const context = useAuthorizationContext();
  const queues = useRequestQueues();
  const patients = usePatients();
  const tab = queueTabFor(params.get('tab'));
  const query = (params.get('q') ?? '').trim().toLowerCase();
  const page = Math.max(0, Number(params.get('page')) || 0);
  useEffect(() => {
    document.title = `${copy.title} · Geneus Health`;
  }, [copy.title]);
  const set = (changes: Record<string, string>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(changes)) {
          if (value) {
            next.set(key, value);
          } else {
            next.delete(key);
          }
        }
        return next;
      },
      { replace: true },
    );
  const patient = useMemo(
    () => new Map((patients.data ?? []).map((p) => [p.patientId, p])),
    [patients.data],
  );
  const queue = queues.data?.[station];
  const rows = useMemo(
    () =>
      (tab === 'pricing'
        ? [...(queue?.open ?? []), ...(queue?.completed ?? [])].filter((r) => r.billingPending)
        : (queue?.[tab === 'catalogue' ? 'open' : tab] ?? [])
      ).filter(
        (request) =>
          !query ||
          [
            patient.get(request.patientId)?.fullName ?? '',
            request.patientId,
            ...request.items,
          ].some((text) => text.toLowerCase().includes(query)),
      ),
    [queue, tab, query, patient],
  );
  const openStatusText = (r: ServiceRequest) => {
    if (station === 'lab') {
      if (r.pending.length === r.items.length) {
        return 'Awaiting results';
      }

      return `${r.items.length - r.pending.length} of ${r.items.length} resulted`;
    }

    return r.partSupplied ? 'Part supplied' : 'To dispense';
  };

  const doneStatusText = (r: ServiceRequest) => {
    if (station === 'lab') {
      return 'Resulted';
    }

    return r.quantityTracked ? 'Complete' : 'Dispensed';
  };

  /** A superseded lab request opens the visit's history instead of the request itself. */
  const requestPath = (r: ServiceRequest) => {
    if (station !== 'lab') {
      return dispensePath(r.patientId, r.encounterId, r.id);
    }

    if (r.superseded) {
      return `/encounters/record?${new URLSearchParams({ patient: r.patientId, visit: r.encounterId })}`;
    }

    return labRequestPath(r.patientId, r.encounterId);
  };

  const columns: TableColumn<ServiceRequest>[] = [
    {
      key: 'patient',
      label: 'Patient',
      sortValue: (r) => patient.get(r.patientId)?.fullName ?? r.patientId,
      render: (r) => (
        <div className="min-w-[140px]">
          <p className="font-bold">
            {patient.get(r.patientId)?.fullName ?? 'Patient not on this device'}
          </p>
          <p className="break-all font-mono text-xs text-ink-soft">{r.patientId}</p>
        </div>
      ),
    },
    {
      key: 'requested',
      label: 'Requested',
      sortValue: (r) => r.requestedOn,
      className: 'hidden md:table-cell',
      render: (r) => visitDate(r.requestedOn),
    },
    {
      key: 'items',
      label: copy.items,
      render: (r) => (
        <div className="flex max-w-[360px] flex-wrap gap-1">
          {r.items.map((item, index) => (
            <Tag
              key={item + index}
              tone={
                station === 'lab' && tab === 'open' && !r.pending.includes(item)
                  ? 'green'
                  : 'neutral'
              }
            >
              {item}
            </Tag>
          ))}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      className: 'hidden md:table-cell',
      render: (r) => {
        if (r.billingPending) {
          return <Tag tone="amber">Billing review · {r.billingPending}</Tag>;
        }

        if (r.superseded) {
          return <Tag>Revised prescription</Tag>;
        }

        if (tab === 'open') {
          return <Tag tone="amber">{openStatusText(r)}</Tag>;
        }

        return (
          <>
            <Tag tone="green">{doneStatusText(r)}</Tag>
            {r.completedOn ? (
              <p className="mt-1 text-xs text-ink-soft">{visitDate(r.completedOn)}</p>
            ) : null}
          </>
        );
      },
    },
    // Financial review is separate from clinical signing; earlier lab sources open visit history.
    {
      key: 'action',
      label: 'Action',
      render: (r) => {
        const to = requestPath(r);
        return tab === 'open' ? (
          <Button fullWidth={false} className="px-3 text-sm" onClick={() => navigate(to)}>
            {copy.open}
          </Button>
        ) : (
          <Button
            variant="outlined"
            fullWidth={false}
            className="px-3 text-sm"
            onClick={() => navigate(to)}
          >
            View
          </Button>
        );
      },
    },
  ];
  const renderQueue = () => {
    if (queues.loading || patients.loading) {
      return <p role="status">Reading requests…</p>;
    }

    if (queues.error) {
      return (
        <div role="alert">
          <p>Requests could not be read.</p>
          <Button fullWidth={false} onClick={queues.reload}>
            Try again
          </Button>
        </div>
      );
    }

    if (rows.length) {
      return (
        <DataTable
          caption={`${copy.title} ${tab} requests`}
          uniformHeaders
          rows={rows}
          rowKey={(r) => r.id}
          page={page}
          onPageChange={(value) => set({ page: String(value) })}
          columns={columns}
        />
      );
    }

    return (
      <p className="rounded-field border border-dashed border-outline p-6">
        {query
          ? 'No requests match this search.'
          : `${copy.empty} ${tab === 'open' ? 'waiting' : 'completed yet'}.`}
      </p>
    );
  };

  return (
    <div className="min-h-screen space-y-5 bg-white px-4 py-5 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-[28px] font-extrabold">{copy.title}</h1>
        {station === 'lab' ? <ModuleSettingsMenu module="laboratory" /> : null}
      </header>
      <SectionTabs
        label={`${copy.title} requests`}
        value={tab}
        onChange={(value) => set({ tab: value === 'open' ? '' : value, page: '' })}
        options={[
          { value: 'catalogue', label: 'Catalogue' },
          { value: 'open', label: 'Open requests', count: queue?.open.length ?? 0 },
          { value: 'completed', label: 'Completed requests', count: queue?.completed.length ?? 0 },
          ...[
            {
              value: 'pricing',
              label: 'Billing review',
              count: [...(queue?.open ?? []), ...(queue?.completed ?? [])].filter(
                (r) => r.billingPending,
              ).length,
            },
          ],
        ]}
      />
      {tab === 'pricing' ? (
        <p className="text-sm">
          These clinical requests remain pending financial review, including completed care.
          Reviewing a bill does not sign clinical care or establish payment.
          {context.permissions.some((p) =>
            ['fee_item:manage', 'payment:receive', 'payment:waive'].includes(p),
          ) ? (
            <Link className="ml-2 font-bold text-brand" to="/billing?tab=review">
              Open financial review
            </Link>
          ) : null}
        </p>
      ) : null}
      {tab === 'catalogue' ? (
        <CatalogueBrowser initialCategory={station === 'lab' ? 'laboratory' : 'pharmacy'} />
      ) : (
        <>
          <div>
            <label htmlFor="request-search" className="mb-2 block text-sm font-bold">
              Search
            </label>
            <div className="flex min-h-[52px] items-center gap-3 rounded-field border border-outline px-4">
              <Icon name="search" className="h-5 w-5 shrink-0 text-ink-soft" />
              <input
                id="request-search"
                type="search"
                value={params.get('q') ?? ''}
                onChange={(e) => set({ q: e.target.value, page: '' })}
                placeholder={copy.search}
                className="min-w-0 flex-1 border-0 bg-transparent p-0 outline-none"
                autoComplete="off"
              />
            </div>
          </div>
          {renderQueue()}
        </>
      )}
    </div>
  );
};
