import { useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, DataTable, Icon, SectionTabs, Tag, type TableColumn } from '@/ui';
import { usePatients } from '@/features/search';
import { useRequestQueues, type ServiceRequest } from '@/features/encounter';
import { visitDate } from '@/features/encounter/VisitTable';
import { PatientChartAccess } from '@/features/patients/PatientChartAccess';
import { patientChartPath, visitRecordPath } from '@/features/patients/patientRoutes';

type Station = 'lab' | 'pharmacy';
const COPY = {
  lab: { title: 'Laboratory', items: 'Tests', search: 'Patient name, ID or test', task: 'lab_results', open: 'Record results', empty: 'No test requests' },
  pharmacy: { title: 'Pharmacy', items: 'Medicines', search: 'Patient name, ID or medicine', task: 'dispense', open: 'Dispense', empty: 'No prescriptions' },
} as const;

/** One service's requests: open until resulted or dispensed, then completed. Only a search narrows them. */
export const ServiceQueueScreen = ({ station }: { station: Station }) => <PatientChartAccess><ServiceQueue station={station} /></PatientChartAccess>;

const ServiceQueue = ({ station }: { station: Station }) => {
  const navigate = useNavigate(), [params, setParams] = useSearchParams(), copy = COPY[station];
  const queues = useRequestQueues(), patients = usePatients();
  const tab = params.get('tab') === 'completed' ? 'completed' : 'open', query = (params.get('q') ?? '').trim().toLowerCase(), page = Math.max(0, Number(params.get('page')) || 0);
  useEffect(() => { document.title = `${copy.title} · Geneus Health`; }, [copy.title]);
  const set = (changes: Record<string, string>) => setParams((current) => { const next = new URLSearchParams(current); for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); } return next; }, { replace: true });
  const patient = useMemo(() => new Map((patients.data ?? []).map((p) => [p.patientId, p])), [patients.data]);
  const queue = queues.data?.[station];
  const rows = useMemo(() => (queue?.[tab] ?? []).filter((request) => !query || [patient.get(request.patientId)?.fullName ?? '', request.patientId, ...request.items].some((text) => text.toLowerCase().includes(query))), [queue, tab, query, patient]);
  const here = `/${station === 'lab' ? 'laboratory' : 'pharmacy'}?${params}`;
  const columns: TableColumn<ServiceRequest>[] = [
    { key: 'patient', label: 'Patient', sortValue: (r) => patient.get(r.patientId)?.fullName ?? r.patientId, render: (r) => <div className="min-w-[140px]"><p className="font-bold">{patient.get(r.patientId)?.fullName ?? 'Patient not on this device'}</p><p className="break-all font-mono text-xs text-ink-soft">{r.patientId}</p></div> },
    { key: 'requested', label: 'Requested', sortValue: (r) => r.requestedOn, className: 'hidden md:table-cell', render: (r) => visitDate(r.requestedOn) },
    { key: 'items', label: copy.items, render: (r) => <div className="flex max-w-[360px] flex-wrap gap-1">{r.items.map((item, index) => <Tag key={item + index} tone={station === 'lab' && tab === 'open' && !r.pending.includes(item) ? 'green' : 'neutral'}>{item}</Tag>)}</div> },
    { key: 'status', label: 'Status', className: 'hidden md:table-cell', render: (r) => tab === 'open'
      ? <Tag tone="amber">{station === 'lab' ? (r.pending.length === r.items.length ? 'Awaiting results' : `${r.items.length - r.pending.length} of ${r.items.length} resulted`) : 'To dispense'}</Tag>
      : <><Tag tone="green">{station === 'lab' ? 'Resulted' : 'Dispensed'}</Tag>{r.completedOn ? <p className="mt-1 text-xs text-ink-soft">{visitDate(r.completedOn)}</p> : null}</> },
    { key: 'action', label: 'Action', render: (r) => tab === 'open'
      ? <Button fullWidth={false} className="px-3 text-sm" onClick={() => navigate(visitRecordPath(r.patientId, r.encounterId, here) + '&task=' + copy.task)}>{copy.open}</Button>
      : <Button variant="outlined" fullWidth={false} className="px-3 text-sm" onClick={() => navigate(patientChartPath(r.patientId, 'visits', { visit: r.encounterId }))}>View</Button> },
  ];
  return <div className="min-h-screen space-y-5 bg-white px-4 py-5 md:px-8">
    <h1 className="text-[28px] font-extrabold">{copy.title}</h1>
    <SectionTabs label={`${copy.title} requests`} value={tab} onChange={(value) => set({ tab: value === 'open' ? '' : value, page: '' })} options={[{ value: 'open', label: 'Open requests', count: queue?.open.length ?? 0 }, { value: 'completed', label: 'Completed requests', count: queue?.completed.length ?? 0 }]} />
    <div><label htmlFor="request-search" className="mb-2 block text-sm font-bold">Search</label><div className="flex min-h-[52px] items-center gap-3 rounded-field border border-outline px-4"><Icon name="search" className="h-5 w-5 shrink-0 text-ink-soft" /><input id="request-search" type="search" value={params.get('q') ?? ''} onChange={(e) => set({ q: e.target.value, page: '' })} placeholder={copy.search} className="min-w-0 flex-1 border-0 bg-transparent p-0 outline-none" autoComplete="off" /></div></div>
    {queues.loading || patients.loading ? <p role="status">Reading requests…</p> : queues.error ? <div role="alert"><p>Requests could not be read.</p><Button fullWidth={false} onClick={queues.reload}>Try again</Button></div>
      : rows.length ? <DataTable caption={`${copy.title} ${tab} requests`} uniformHeaders rows={rows} rowKey={(r) => r.id} page={page} onPageChange={(value) => set({ page: String(value) })} columns={columns} />
      : <p className="rounded-field border border-dashed border-outline p-6">{query ? 'No requests match this search.' : `${copy.empty} ${tab === 'open' ? 'waiting' : 'completed yet'}.`}</p>}
  </div>;
};
