import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, DateRangeField, Icon, SelectField, Sheet, TextField, useToast } from '@/ui';
import { inRange } from '@/lib/dateRange';
import { useAuthorizationContext } from '@/session';
import { usePatients } from '@/features/search';
import { patientChartPath, visitRecordPath } from '@/features/patients/patientRoutes';
import { calendarDate } from '@/lib/calendarDate';
import { APPOINTMENT_GROUP_LABELS, bookingIsInactive, rowActionsFor, splitToday } from './appointmentList';
import { AppointmentActions, BookingChangeSheet } from './AppointmentActions';
import { useAppointments } from './AppointmentsProvider';
import { AppointmentWorklist, type RowMenuItem } from './AppointmentWorklist';
import { BookAppointmentSheet } from './BookAppointmentSheet';
import type { AppointmentPatient, AppointmentGroup, BookedAppointment } from './types';

export const AppointmentWorkspace = () => {
  const context = useAuthorizationContext();
  const navigate = useNavigate();
  const query = useAppointments();
  const patients = usePatients();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(''), [patientSearch, setPatientSearch] = useState('');
  const [choosing, setChoosing] = useState(false), [bookingPatient, setBookingPatient] = useState<AppointmentPatient>();
  const [rebooking, setRebooking] = useState<BookedAppointment>(), [busyId, setBusyId] = useState('');
  const toast = useToast();
  useEffect(() => { document.title = 'Appointments · Geneus Health'; }, []);
  const groupValue = params.get('group');
  // "All" is the default view; a named group (e.g. ?group=today from the dashboard) narrows it.
  const group: AppointmentGroup | 'all' = groupValue && Object.keys(APPOINTMENT_GROUP_LABELS).includes(groupValue) ? groupValue as AppointmentGroup : 'all';
  const from = params.get('from') ?? '', to = params.get('to') ?? '';
  // Dates apply outside Today only; the old attendance filter is retired and its address parameter ignored.
  const dated = group !== 'today' && Boolean(from || to);
  const change = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); return next; });
  const selected = query.appointments.find((appointment) => appointment.id === params.get('booking'));
  const shown = query.appointments.filter((appointment) => (group === 'all' || appointment.group === group) && (!dated || inRange(calendarDate(appointment.at), from, to)) && `${appointment.patient.name} ${appointment.patient.id} ${appointment.reason}`.toLowerCase().includes(search.toLowerCase()));
  const close = () => change('booking', '');
  const overdueCount = query.appointments.filter((appointment) => appointment.group === 'overdue').length;
  const candidates = patients.data?.filter((patient) => `${patient.fullName} ${patient.patientId}`.toLowerCase().includes(patientSearch.toLowerCase())).slice(0, 30) ?? [];
  const open = (appointment: BookedAppointment) => change('booking', appointment.id);
  const canUpdate = context.permissions.includes('appointment:update');
  // Arrival is routine: one tap, recorded with the actor and time in the booking history.
  // A mistaken arrival is corrected from the booking details (reschedule or cancel, with a reason).
  const arrive = async (booking: BookedAppointment) => {
    if (busyId) return;
    setBusyId(booking.id);
    try {
      const history = booking.activity ?? [];
      await query.change(booking.id, { action: 'arrived', expectedActivityId: history[history.length - 1]?.id });
      toast(`${booking.patient.name} arrived. ${booking.paymentStatus === 'Awaiting payment' ? 'Fees are waiting at the cashier; care can still begin.' : 'Ready for the nurse station.'}`);
    } catch (cause) { toast(cause instanceof Error ? cause.message : 'The arrival could not be saved. Try again.', { tone: 'error' }); }
    finally { setBusyId(''); }
  };
  const canRecord = context.permissions.includes('encounter:record');
  const menu = (booking: BookedAppointment): RowMenuItem[] => rowActionsFor(booking, { canUpdate, canRecord }).map((action) => {
    if (action === 'arrive') return { label: 'Record arrival', icon: 'check', onSelect: () => void arrive(booking) };
    if (action === 'rebook') return { label: 'Rebook', icon: 'calendar', onSelect: () => setRebooking(booking) };
    if (action === 'visit') return { label: booking.encounterId ? 'Continue visit' : 'Start visit', icon: 'encounter', onSelect: () => navigate(visitRecordPath(booking.patient.id, booking.encounterId ?? '', '/appointments?' + params, booking.id)) };
    if (action === 'booking') return { label: 'View booking', icon: 'clock', onSelect: () => open(booking) };
    return { label: 'View patient details', icon: 'patients', onSelect: () => navigate(patientChartPath(booking.patient.id, 'details')) };
  });
  return<div className="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-7"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-[28px] font-extrabold">Appointments</h1><p className="mt-1 text-sm text-ink-muted">Planned bookings and their linked visits. A recommended follow-up date is not a booking.</p></div>{context.permissions.includes('appointment:create') ? <Button fullWidth={false} onClick={() => { setPatientSearch(''); setChoosing(true); }}>Book appointment</Button> : null}</header>
    {overdueCount && group !== 'overdue' && group !== 'all' ? <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-field border border-amber-border bg-amber-bg px-4 py-3 text-sm font-bold text-amber-text">{overdueCount} overdue booking{overdueCount === 1 ? '' : 's'}<button type="button" className="min-h-0 underline underline-offset-2" onClick={() => change('group', 'overdue')}>Show them</button></p> : null}
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-[1_1_320px]"><label htmlFor="appointment-search" className="mb-1.5 flex min-h-5 items-center text-[13px] font-semibold text-ink-soft">Search appointments</label><div className="flex items-center gap-3 rounded-field border-[1.5px] border-outline bg-white px-4 focus-within:border-2 focus-within:border-brand"><Icon name="search" className="h-5 w-5 shrink-0 text-ink-soft" /><input id="appointment-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Patient name, ID or reason" autoComplete="off" className="min-w-0 flex-1 border-0 bg-transparent py-3.5 text-base text-ink outline-none" /></div></div>
      <div className="w-full sm:w-60"><SelectField label="Show" value={group} onChange={(event) => change('group', event.target.value)} options={[{ value: 'all', label: 'All' + (!query.loading && !query.error ? ` (${query.appointments.length})` : '') }, ...(Object.keys(APPOINTMENT_GROUP_LABELS) as AppointmentGroup[]).map((value) => ({ value, label: APPOINTMENT_GROUP_LABELS[value] + (!query.loading && !query.error ? ` (${query.appointments.filter((appointment) => appointment.group === value).length})` : '') }))]} /></div>
      {/* Every row under Today is already today, so a date range would only hide rows. */}
      {group !== 'today' ? <div className="w-full sm:w-[300px]"><DateRangeField label="Dates" from={from} to={to} onChange={(nextFrom, nextTo) => setParams((current) => { const next = new URLSearchParams(current); if (nextFrom) next.set('from', nextFrom); else next.delete('from'); if (nextTo) next.set('to', nextTo); else next.delete('to'); return next; })} /></div> : null}
    </div>
    {!query.loading && !query.error ? <p className="text-sm text-ink-soft" aria-live="polite">{shown.length} booking{shown.length === 1 ? '' : 's'}{group === 'today' ? ' today' : ''}{search && dated ? ' match your search and dates' : search ? ' match your search' : dated ? ' in these dates' : ''}</p> : null}
    {query.loading ? <p role="status">Reading appointments…</p> : query.error ? <div role="alert"><p>Appointments could not be read.</p><Button variant="ghost" onClick={query.reload}>Try again</Button></div> : !shown.length ? <p className="rounded-card border border-dashed border-outline bg-white p-5 text-sm text-ink-muted">{search || dated ? 'No appointments match this view, search and dates.' : group === 'all' ? 'No appointments on this device yet.' : `No ${APPOINTMENT_GROUP_LABELS[group].toLowerCase()} appointments on this device.`}</p> : group === 'today' ? (() => { const { expected, arrived } = splitToday(shown); return <div className="space-y-5">
      <section aria-labelledby="expected-heading" className="space-y-2"><h2 id="expected-heading" className="text-sm font-extrabold uppercase tracking-wide text-ink-muted">Expected · {expected.length}</h2>{expected.length ? <AppointmentWorklist appointments={expected} actions={menu} /> : <p className="text-sm text-ink-muted">Everyone booked for today has arrived.</p>}</section>
      {arrived.length ? <section aria-labelledby="arrived-heading" className="space-y-2"><h2 id="arrived-heading" className="text-sm font-extrabold uppercase tracking-wide text-ink-muted">Arrived or in care · {arrived.length}</h2><AppointmentWorklist appointments={arrived} actions={menu} /></section> : null}
    </div>; })() : <AppointmentWorklist appointments={shown} actions={menu} />}
    {selected ? <Sheet title="Booking details" eyebrow={selected.patient.name} onClose={close}><dl className="space-y-4 text-sm"><div><dt className="font-bold text-ink-muted">Patient</dt><dd className="mt-1">{selected.patient.name}<span className="block break-all font-mono text-xs">{selected.patient.id}</span></dd></div><div><dt className="font-bold text-ink-muted">When</dt><dd className="mt-1">{new Date(selected.at).toLocaleString('en-GB')}</dd></div><div><dt className="font-bold text-ink-muted">Reason</dt><dd className="mt-1">{selected.reason}</dd></div><div><dt className="font-bold text-ink-muted">Recorded care</dt><dd className="mt-1">{selected.group === 'completed' ? 'Linked visit completed' : selected.encounterId ? 'Visit in progress' : 'No linked visit started'}</dd></div>{selected.paymentStatus ? <div><dt className="font-bold text-ink-muted">Booking fees</dt><dd className="mt-1">{selected.paymentStatus}</dd></div> : null}</dl><div className="mt-5 flex flex-wrap gap-3"><Link className="inline-flex min-h-[52px] items-center rounded-field border border-outline px-4 py-3 font-bold text-brand" to={patientChartPath(selected.patient.id, 'details')}>View patient details</Link>{context.permissions.includes('encounter:record') && selected.group !== 'completed' && !bookingIsInactive(selected) ? <Link className="inline-flex min-h-[52px] items-center rounded-field bg-brand px-4 py-3 font-bold text-white" to={visitRecordPath(selected.patient.id, selected.encounterId ?? '', '/appointments?' + params, selected.id)}>{selected.encounterId ? 'Continue visit' : 'Start visit'}</Link> : null}</div><AppointmentActions key={selected.id} booking={selected} /></Sheet> : null}
    {choosing ? <Sheet title="Choose patient for booking" onClose={() => setChoosing(false)}><TextField label="Patient name or ID" type="search" value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} />{patients.loading ? <p role="status">Reading patients…</p> : patients.error ? <div role="alert">Patients could not be read.<Button variant="ghost" onClick={patients.reload}>Try again</Button></div> : <ul className="mt-4 divide-y divide-outline-soft">{candidates.map((patient) => <li key={patient.patientId}><button type="button" className="min-h-[64px] w-full py-3 text-left" onClick={() => { setBookingPatient({ id: patient.patientId, name: patient.fullName, initials: '', allergy: '' }); setChoosing(false); }}><span className="block font-bold">{patient.fullName}</span><span className="block break-all font-mono text-xs text-ink-muted">{patient.patientId}</span></button></li>)}</ul>}{!patients.loading && !patients.error && !candidates.length ? <p className="mt-4 text-sm text-ink-muted">No patients match this search.</p> : null}<Link className="mt-4 inline-flex min-h-[44px] items-center font-bold text-brand" to="/patients/search">Find or register a patient</Link></Sheet> : null}
    {rebooking ? <BookingChangeSheet booking={rebooking} action="rescheduled" onClose={() => setRebooking(undefined)} /> : null}
    {bookingPatient ? <BookAppointmentSheet patient={bookingPatient} onClose={() => { setBookingPatient(undefined); query.reload(); }} /> : null}
  </div>;
};
