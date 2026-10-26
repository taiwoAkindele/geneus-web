import { useSearchParams } from 'react-router-dom';
import { Button, DataTable, SelectField, Sheet, Tag } from '@/ui';
import { APPOINTMENT_GROUP_LABELS, AppointmentActions, bookingAttendanceLabel, bookingIsInactive, type BookedAppointment } from '@/features/appointments';
import type { EncounterSummary } from '@/features/encounter';
import { visitDate } from '@/features/encounter/VisitTable';

export const PatientAppointments = ({ appointments, history, loading, error, onReload, onBook, canRecord, canBook, onStart, onVisit }: { appointments: BookedAppointment[]; history: EncounterSummary[]; loading: boolean; error?: Error; onReload: () => void; onBook: () => void; canRecord: boolean; canBook: boolean; onStart: (appointment: BookedAppointment) => void; onVisit: (id: string, continueVisit?: boolean) => void }) => {
  const [params, setParams] = useSearchParams();
  const group = params.get('bookingGroup') ?? '';
  const selected = appointments.find((a) => a.id === params.get('booking'));
  const select = (id?: string) => setParams((current) => { const next = new URLSearchParams(current); if (id) next.set('booking', id); else next.delete('booking'); return next; });
  const shown = appointments.filter((a) => !group || a.group === group);
  const existing = selected?.encounterId ? history.find((visit) => visit.id === selected.encounterId) : undefined;
  const currentVisit = history.find((visit) => visit.status === 'Open');
  return <section className="space-y-5" aria-label="Patient appointments">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-extrabold">Appointments</h2><p className="mt-1 text-sm text-ink-soft">Planned bookings and their linked visits. A care-plan review date is not a booking.</p></div>{canBook ? <Button fullWidth={false} onClick={onBook}>Book appointment</Button> : null}</div>
    {loading ? <p role="status">Reading appointments…</p> : error ? <div role="alert" className="rounded-field border border-outline p-4"><p>Appointments could not be read.</p><Button variant="ghost" onClick={onReload}>Try again</Button></div> : <>
      <div className="max-w-xs"><SelectField label="Appointment group" value={group} onChange={(event) => setParams((current) => { const next = new URLSearchParams(current); if (event.target.value) next.set('bookingGroup', event.target.value); else next.delete('bookingGroup'); return next; }, { replace: true })} options={[{ value: '', label: 'All bookings' }, ...Object.entries(APPOINTMENT_GROUP_LABELS).map(([value, label]) => ({ value, label }))]} /></div>
      <p className="text-sm text-ink-soft">{shown.length} of {appointments.length} bookings</p>
      {shown.length ? <DataTable key={group} caption="Patient appointments" rows={shown} rowKey={(a) => a.id} columns={[
        { key: 'date', label: 'Date / reason', sortValue: (a) => a.at, render: (a) => <div><b>{visitDate(a.at)}</b><p className="mt-1 text-sm">{a.reason}</p></div> },
        { key: 'status', label: 'Booking status', render: (a) => <div><Tag tone={a.group === 'overdue' ? 'amber' : 'slate'}>{APPOINTMENT_GROUP_LABELS[a.group]}</Tag><p className="mt-1 text-xs">{bookingAttendanceLabel(a)}</p>{a.paymentStatus ? <p className="mt-2 text-xs text-ink-soft">{a.paymentStatus === 'Awaiting payment' ? 'Awaiting payment · care can continue' : a.paymentStatus}</p> : null}</div> },
        { key: 'action', label: 'Action', render: (a) => <Button variant="outlined" fullWidth={false} className="min-h-[44px] px-3 py-3 text-sm" onClick={() => a.encounterId ? onVisit(a.encounterId, canRecord && history.some((visit) => visit.id === a.encounterId && visit.status === 'Open')) : select(a.id)}>{a.encounterId ? canRecord && history.some((visit) => visit.id === a.encounterId && visit.status === 'Open') ? 'Continue visit' : 'View visit' : 'View booking'}</Button> },
      ]} /> : <p className="rounded-field border border-dashed border-outline p-5 text-sm text-ink-soft">No appointments match this group.{canBook ? ' Use Book appointment to reserve a review.' : ''}</p>}
    </>}
    {selected ? <Sheet title="Appointment details" eyebrow={selected.patient.name} placement="side" onClose={() => select()}>
      <dl className="space-y-4 text-sm"><div><dt className="font-bold">Date and time</dt><dd>{visitDate(selected.at)}</dd></div><div><dt className="font-bold">Reason</dt><dd>{selected.reason}</dd></div><div><dt className="font-bold">Booking status</dt><dd>{APPOINTMENT_GROUP_LABELS[selected.group]}</dd></div><div><dt className="font-bold">Patient ID</dt><dd className="break-all font-mono">{selected.patient.id}</dd></div></dl>
      <div className="mt-6 space-y-3">{selected.encounterId ? <Button onClick={() => onVisit(selected.encounterId!, canRecord && existing?.status === 'Open')}>{canRecord && existing?.status === 'Open' ? 'Continue visit' : 'View visit'}</Button> : canRecord && !bookingIsInactive(selected) ? currentVisit ? <><p className="text-sm text-ink-soft">This patient already has an open visit. Continue it to avoid creating another episode. This booking is not linked to that visit.</p><Button onClick={() => onVisit(currentVisit.id, true)}>Continue current visit</Button></> : <><p className="text-sm text-ink-soft">Start care now. The visit is created when its first clinical entry is signed.</p><Button onClick={() => onStart(selected)}>Start visit now</Button></> : <p className="text-sm text-ink-soft">A clinician can start care from an active booking.</p>}</div>
      <AppointmentActions key={selected.id} booking={selected} />
    </Sheet> : null}
  </section>;
};
