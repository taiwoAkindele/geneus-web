import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button, SectionTabs, SelectField, Sheet, TextField, useToast } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { usePatients } from '@/features/search';
import { patientChartPath, visitRecordPath } from '@/features/patients/patientRoutes';
import { calendarDate } from '@/lib/calendarDate';
import { APPOINTMENT_GROUP_LABELS, bookingIsInactive, quickActionFor, splitToday } from './appointmentList';
import { AppointmentActions, BookingChangeSheet } from './AppointmentActions';
import { useAppointments } from './AppointmentsProvider';
import { AppointmentWorklist } from './AppointmentWorklist';
import { BookAppointmentSheet } from './BookAppointmentSheet';
import type { AppointmentPatient, AppointmentGroup, BookedAppointment } from './types';

export const AppointmentWorkspace = () => {
  const context = useAuthorizationContext();
  const query = useAppointments();
  const patients = usePatients();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(''), [patientSearch, setPatientSearch] = useState('');
  const [choosing, setChoosing] = useState(false), [bookingPatient, setBookingPatient] = useState<AppointmentPatient>();
  const [rebooking, setRebooking] = useState<BookedAppointment>(), [busyId, setBusyId] = useState('');
  const toast = useToast();
  useEffect(() => { document.title = 'Appointments · Geneus Health'; }, []);
  const groupValue = params.get('group');
  const group: AppointmentGroup = groupValue && Object.keys(APPOINTMENT_GROUP_LABELS).includes(groupValue) ? groupValue as AppointmentGroup : 'today';
  const from = params.get('from') ?? '', to = params.get('to') ?? '';
  const attendance = params.get('attendance') ?? '';
  const change = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); return next; });
  const selected = query.appointments.find((appointment) => appointment.id === params.get('booking'));
  const shown = query.appointments.filter((appointment) => appointment.group === group && (!attendance || (appointment.attendance ?? 'booked') === attendance) && (!from || calendarDate(appointment.at) >= from) && (!to || calendarDate(appointment.at) <= to) && `${appointment.patient.name} ${appointment.patient.id} ${appointment.reason}`.toLowerCase().includes(search.toLowerCase()));
  const close = () => change('booking', '');
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
  const quick = (booking: BookedAppointment) => {
    const action = canUpdate ? quickActionFor(booking) : undefined;
    if (action === 'arrive') return <Button fullWidth={false} className="px-4 py-2 text-sm" loading={busyId === booking.id} disabled={Boolean(busyId)} onClick={() => void arrive(booking)}>Record arrival</Button>;
    if (action === 'rebook') return <Button variant="outlined" fullWidth={false} className="px-4 py-2 text-sm" onClick={() => setRebooking(booking)}>Rebook</Button>;
    return null;
  };
  return<div className="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-7"><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-[28px] font-extrabold">Appointments</h1><p className="mt-1 text-sm text-ink-muted">Planned bookings and their linked visits. A recommended follow-up date is not a booking.</p></div>{context.permissions.includes('appointment:create') ? <Button fullWidth={false} onClick={() => { setPatientSearch(''); setChoosing(true); }}>Book appointment</Button> : null}</header>
    <SectionTabs label="Appointment groups" value={group} onChange={(value) => change('group', value)} options={(Object.keys(APPOINTMENT_GROUP_LABELS) as AppointmentGroup[]).map((value) => ({ value, label: APPOINTMENT_GROUP_LABELS[value], count: !query.loading && !query.error ? query.appointments.filter((appointment) => appointment.group === value).length : undefined }))} />
    <div className="max-w-xl"><TextField label="Find appointment" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Patient, ID or reason" /></div>
    <details className="rounded-field border border-outline-soft bg-white p-3"><summary className="min-h-[44px] cursor-pointer py-2 text-sm font-bold text-brand">Filter appointments{[attendance, from, to].filter(Boolean).length ? ` · ${[attendance, from, to].filter(Boolean).length} applied` : ''}</summary><div className="mt-3 grid gap-3 sm:grid-cols-3"><SelectField label="Attendance" value={attendance} onChange={(event) => change('attendance', event.target.value)} options={[{ value: '', label: 'All attendance states' }, { value: 'booked', label: 'Not arrived' }, { value: 'arrived', label: 'Arrived' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'no_show', label: 'No-show' }]} /><TextField label="Bookings from" type="date" value={from} onChange={(event) => change('from', event.target.value)} /><TextField label="Bookings to" type="date" value={to} onChange={(event) => change('to', event.target.value)} /></div>{attendance || from || to ? <Button variant="ghost" fullWidth={false} className="mt-3" onClick={() => setParams((current) => { const next = new URLSearchParams(current); for (const key of ['attendance', 'from', 'to']) next.delete(key); return next; })}>Clear filters</Button> : null}</details>
    {from && to && from > to ? <p role="alert" className="text-sm text-danger">The end date must be on or after the start date.</p> : null}
    {query.loading ? <p role="status">Reading appointments…</p> : query.error ? <div role="alert"><p>Appointments could not be read.</p><Button variant="ghost" onClick={query.reload}>Try again</Button></div> : !shown.length ? <p className="rounded-card border border-dashed border-outline bg-white p-5 text-sm text-ink-muted">{search || attendance || from || to ? 'No appointments match this group and its filters.' : `No ${APPOINTMENT_GROUP_LABELS[group].toLowerCase()} appointments on this device.`}</p> : group === 'today' ? (() => { const { expected, arrived } = splitToday(shown); return <div className="space-y-5">
      <section aria-labelledby="expected-heading" className="space-y-2"><h2 id="expected-heading" className="text-sm font-extrabold uppercase tracking-wide text-ink-muted">Expected · {expected.length}</h2>{expected.length ? <AppointmentWorklist appointments={expected} onOpen={open} actionLabel="View booking" quickAction={quick} /> : <p className="text-sm text-ink-muted">Everyone booked for today has arrived.</p>}</section>
      {arrived.length ? <section aria-labelledby="arrived-heading" className="space-y-2"><h2 id="arrived-heading" className="text-sm font-extrabold uppercase tracking-wide text-ink-muted">Arrived or in care · {arrived.length}</h2><AppointmentWorklist appointments={arrived} onOpen={open} actionLabel="View booking" quickAction={quick} /></section> : null}
    </div>; })() : <AppointmentWorklist appointments={shown} onOpen={open} actionLabel="View booking" quickAction={quick} />}
    <p className="text-xs leading-relaxed text-ink-muted">Today, upcoming and overdue group active bookings by date. Attendance is recorded separately; no-shows are never automatic. A booking completes when its linked visit closes. Other devices' changes arrive when this device syncs.</p>
    {selected ? <Sheet title="Booking details" eyebrow={selected.patient.name} onClose={close}><dl className="space-y-4 text-sm"><div><dt className="font-bold text-ink-muted">Patient</dt><dd className="mt-1">{selected.patient.name}<span className="block break-all font-mono text-xs">{selected.patient.id}</span></dd></div><div><dt className="font-bold text-ink-muted">When</dt><dd className="mt-1">{new Date(selected.at).toLocaleString('en-GB')}</dd></div><div><dt className="font-bold text-ink-muted">Reason</dt><dd className="mt-1">{selected.reason}</dd></div><div><dt className="font-bold text-ink-muted">Recorded care</dt><dd className="mt-1">{selected.group === 'completed' ? 'Linked visit completed' : selected.encounterId ? 'Visit in progress' : 'No linked visit started'}</dd></div>{selected.paymentStatus ? <div><dt className="font-bold text-ink-muted">Booking fees</dt><dd className="mt-1">{selected.paymentStatus}</dd></div> : null}</dl><div className="mt-5 flex flex-wrap gap-3"><Link className="inline-flex min-h-[52px] items-center rounded-field border border-outline px-4 py-3 font-bold text-brand" to={patientChartPath(selected.patient.id, 'details')}>View patient details</Link>{context.permissions.includes('encounter:record') && selected.group !== 'completed' && !bookingIsInactive(selected) ? <Link className="inline-flex min-h-[52px] items-center rounded-field bg-brand px-4 py-3 font-bold text-white" to={visitRecordPath(selected.patient.id, selected.encounterId ?? '', '/appointments?' + params, selected.id)}>{selected.encounterId ? 'Continue visit' : 'Start visit'}</Link> : null}</div><AppointmentActions key={selected.id} booking={selected} /></Sheet> : null}
    {choosing ? <Sheet title="Choose patient for booking" onClose={() => setChoosing(false)}><TextField label="Patient name or ID" type="search" value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} />{patients.loading ? <p role="status">Reading patients…</p> : patients.error ? <div role="alert">Patients could not be read.<Button variant="ghost" onClick={patients.reload}>Try again</Button></div> : <ul className="mt-4 divide-y divide-outline-soft">{candidates.map((patient) => <li key={patient.patientId}><button type="button" className="min-h-[64px] w-full py-3 text-left" onClick={() => { setBookingPatient({ id: patient.patientId, name: patient.fullName, initials: '', allergy: '' }); setChoosing(false); }}><span className="block font-bold">{patient.fullName}</span><span className="block break-all font-mono text-xs text-ink-muted">{patient.patientId}</span></button></li>)}</ul>}{!patients.loading && !patients.error && !candidates.length ? <p className="mt-4 text-sm text-ink-muted">No patients match this search.</p> : null}<Link className="mt-4 inline-flex min-h-[44px] items-center font-bold text-brand" to="/patients/search">Find or register a patient</Link></Sheet> : null}
    {rebooking ? <BookingChangeSheet booking={rebooking} action="rescheduled" onClose={() => setRebooking(undefined)} /> : null}
    {bookingPatient ? <BookAppointmentSheet patient={bookingPatient} onClose={() => { setBookingPatient(undefined); query.reload(); }} /> : null}
  </div>;
};
