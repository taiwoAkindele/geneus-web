import { useSearchParams } from 'react-router-dom';
import type { Patient } from '@shared';
import { ActionMenu, Button, DataTable, SelectField, Tag, TextField } from '@/ui';
import type { EncounterSummary } from './encounterSummary';
import { calendarDate } from '@/lib/calendarDate';

export type VisitAction = 'view' | 'continue' | 'print' | 'activity' | 'amend';
export const visitStatusLabel = (status: EncounterSummary['status']) => status === 'Open' ? 'In progress' : status === 'Closed' ? 'Completed' : 'Admitted';
export const visitDate = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Both the facility list and patient history use one table and the same actions. */
export const VisitTable = ({ visits, patients, canRecord, onAction, detailFor, orderLabel = 'newest first unless sorted', serviceQueue = false }: { visits: EncounterSummary[]; patients?: Patient[]; canRecord: boolean; onAction: (visit: EncounterSummary, action: VisitAction) => void; detailFor?: (visit: EncounterSummary) => string; orderLabel?: string; serviceQueue?: boolean }) => {
  const [params, setParams] = useSearchParams();
  const query = params.get('visitQuery') ?? '', status = params.get('visitStatus') ?? '', from = params.get('visitFrom') ?? '', to = params.get('visitTo') ?? '';
  const pageValue = Number(params.get('visitPage') ?? 0);
  const page = Number.isInteger(pageValue) && pageValue >= 0 ? pageValue : 0;
  const sortKey = params.get('visitSort');
  const sort = sortKey === 'visit' || sortKey === 'status' ? { key: sortKey, descending: params.get('visitDescending') === '1' } : undefined;
  const change = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); if (key !== 'visitPage') next.delete('visitPage'); return next; }, { replace: true });
  const name = (id: string) => patients?.find((patient) => patient.patientId === id)?.fullName ?? id;
  const shown = visits.filter((visit) => (!status || visit.status === status) && (visit.careType === 'inpatient' || ((!from || calendarDate(visit.openedOn) >= from) && (!to || calendarDate(visit.openedOn) <= to))) && `${visit.title} ${visit.label} ${visit.patientId} ${name(visit.patientId)}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="space-y-4" aria-label="Visit history">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(200px,2fr)_1fr_1fr_1fr]">
      <TextField label="Search visits" type="search" value={query} onChange={(event) => change('visitQuery', event.target.value)} placeholder={patients ? 'Patient, ID or reason' : 'Reason, diagnosis or visit ID'} />
      <SelectField label="Visit status" value={status} onChange={(event) => change('visitStatus', event.target.value)} options={[{ value: '', label: 'All statuses' }, { value: 'Open', label: 'In progress' }, { value: 'Closed', label: 'Completed' }, { value: 'Admitted', label: 'Admitted' }]} />
      <TextField label="Visits from" type="date" value={from} onChange={(event) => change('visitFrom', event.target.value)} />
      <TextField label="Visits to" type="date" value={to} onChange={(event) => change('visitTo', event.target.value)} />
    </div>
    {from && to && from > to ? <p role="alert" className="text-sm text-danger">The end date must be on or after the start date.</p> : null}
    {(from || to) && visits.some((visit) => visit.careType === 'inpatient') ? <p className="text-sm text-ink-soft">Active inpatients stay visible even when admitted before the selected dates.</p> : null}
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-soft"><span>{shown.length} of {visits.length} visits · {orderLabel}</span>{query || status || from || to ? <button className="min-h-[44px] font-bold text-brand" type="button" onClick={() => setParams((current) => { const next = new URLSearchParams(current); ['visitQuery', 'visitStatus', 'visitFrom', 'visitTo', 'visitPage'].forEach((key) => next.delete(key)); return next; }, { replace: true })}>Clear visit filters</button> : null}</div>
    {shown.length ? <DataTable key={`${query}|${status}|${from}|${to}`} caption={patients ? 'Facility visits' : 'Patient visits'} rows={shown} rowKey={(visit) => visit.id} page={page} onPageChange={(value) => change('visitPage', String(value))} sort={sort} onSortChange={(value) => setParams((current) => { const next = new URLSearchParams(current); next.set('visitSort', value.key); next.set('visitDescending', value.descending ? '1' : '0'); next.delete('visitPage'); return next; }, { replace: true })} columns={[
      { key: 'visit', label: patients ? 'Patient / visit' : 'Visit date', sortValue: (visit) => patients ? name(visit.patientId) : visit.openedOn, render: (visit) => <div className="min-w-[100px] max-w-[260px]">
        {patients ? <p className="font-bold">{name(visit.patientId)}</p> : null}<button type="button" className="min-h-[44px] py-1 text-left font-bold text-brand hover:underline" onClick={() => onAction(visit, 'view')}>{visitDate(visit.openedOn)}</button>
        <p className="break-all font-mono text-xs text-ink-soft">{patients ? visit.patientId : visit.label}</p><p className="mt-1 text-sm lg:hidden">{visit.title}</p>
        <p className="mt-2 text-sm text-ink-soft md:hidden">{detailFor?.(visit) ?? visit.nextAction}</p>
      </div> },
      { key: 'reason', label: 'Reason / diagnosis', className: 'hidden lg:table-cell', render: (visit) => <span className="font-semibold">{visit.title}</span> },
      { key: 'status', label: 'Care / status', sortValue: (visit) => visit.status, render: (visit) => <><Tag tone={visit.status === 'Open' ? 'amber' : 'slate'}>{visit.careType === 'inpatient' ? 'Inpatient' : visit.careType === 'past_inpatient' ? 'Discharged stay' : visitStatusLabel(visit.status)}</Tag>{visit.admissionStatus ? <p className="mt-2 text-sm">{visit.admissionStatus}</p> : null}{visit.wardBed && visit.careType === 'inpatient' ? <p className="mt-1 text-sm text-ink-soft">{visit.wardBed}</p> : null}</> },
      { key: 'next', label: 'Next action', className: 'hidden md:table-cell', render: (visit) => detailFor?.(visit) ?? visit.nextAction },
      { key: 'actions', label: 'Actions', render: (visit) => <div className="flex flex-col items-start gap-1 xl:flex-row xl:items-center">
        <Button variant={(visit.status === 'Open' || serviceQueue) && canRecord ? 'primary' : 'outlined'} fullWidth={false} className="min-h-[44px] px-3 py-3 text-sm" onClick={() => onAction(visit, (visit.status === 'Open' || serviceQueue) && canRecord ? 'continue' : 'view')}>{(visit.status === 'Open' || serviceQueue) && canRecord ? (serviceQueue ? 'Open service task' : 'Continue visit') : 'View visit'}</Button>
        <ActionMenu compact label={`Visit actions for ${visitDate(visit.openedOn)}${patients ? ` · ${name(visit.patientId)}` : ''}`} title={`Visit actions · ${visitDate(visit.openedOn)}`} actions={[{ label: 'Print visit summary', icon: 'print', onSelect: () => onAction(visit, 'print') }, { label: 'View activity log', icon: 'clock', onSelect: () => onAction(visit, 'activity') }, ...(canRecord && visit.hasSignedEntries ? [{ label: 'Add amendment…', icon: 'plus' as const, onSelect: () => onAction(visit, 'amend') }] : [])]} />
      </div> },
    ]} /> : <p className="rounded-field border border-dashed border-outline p-6 text-sm text-ink-soft">{visits.length ? 'No visits match these filters.' : 'No visits recorded yet. Start a visit when care begins.'}</p>}
  </section>;
};
