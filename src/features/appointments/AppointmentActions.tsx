import { useEffect, useRef, useState } from 'react';
import type { AppointmentAction } from '@shared';
import { useAuthorizationContext } from '@/session';
import { useLiveQuery } from '@/data';
import { listStaff } from '@/data/repos/staff';
import { reallocateAppointment } from '@/data/repos/appointments';
import { useWorkforce } from '@/features/workforce/useWorkforce';
import { zonedInput } from '@/lib/workforceTime';
import type { AppointmentChange } from '@/data/repos/appointments';
import { calendarDate } from '@/lib/calendarDate';
import { Button, Sheet, SheetCancelButton, TextAreaField, TextField, useToast } from '@/ui';
import { bookingAttendanceLabel, bookingIsInactive } from './appointmentList';
import { useAppointments } from './AppointmentsProvider';
import type { BookedAppointment } from './types';
import { AllocationFields, type AllocationProposal } from '@/features/workforce/AllocationFields';
import { ReservationStatus } from '@/features/workforce/ReservationStatus';

const ACTION_LABELS: Record<AppointmentAction, string> = { arrived: 'Record arrival', cancelled: 'Cancel booking', no_show: 'Mark no-show', rescheduled: 'Reschedule', reopened: 'Reopen booking' };
const OUTCOME_LABELS: Record<AppointmentAction, string> = { arrived: 'Arrival recorded', cancelled: 'Booking cancelled', no_show: 'No-show recorded', rescheduled: 'Booking rescheduled', reopened: 'Booking reopened' };
const timeOf = (at: string) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

const ChangeSheet = ({ booking, action, zone, onClose }: { booking: BookedAppointment; action: AppointmentAction; zone?:string; onClose: () => void }) => {
  const query = useAppointments(), toast = useToast();
  const [date, setDate] = useState(zone?zonedInput(booking.at,zone).slice(0,10):calendarDate(booking.at)), [time, setTime] = useState(zone?zonedInput(booking.at,zone).slice(11):timeOf(booking.at)), [reason, setReason] = useState('');
  const [resource,setResource]=useState<AllocationProposal>({allocation:booking.allocation});
  const [review, setReview] = useState<AppointmentChange>(), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const lock = useRef(false), reviewHeading = useRef<HTMLHeadingElement>(null), errorBox = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (review) reviewHeading.current?.focus(); }, [review]);
  useEffect(() => { if (error) errorBox.current?.focus(); }, [error]);
  const prepare = () => {
    setError('');
    if (action !== 'arrived' && !reason.trim()) { setError('Explain the reason for this change.'); return; }
    if(action==='rescheduled'&&resource.error){setError(resource.error);return;}
    const target = new Date(resource.scheduledFor||`${date}T${time}`);
    if (action === 'rescheduled' && (!date || !time || !Number.isFinite(target.getTime()) || target.getTime() <= Date.now() || target.toISOString() === booking.scheduledFor)) { setError('Choose a different future date and time.'); return; }
    const history = booking.activity ?? [];
    setReview({ action, ...(action==='rescheduled'?{allocation:resource.allocation||null}:{}), reason: reason.trim() || undefined, scheduledFor: action === 'rescheduled' ? target.toISOString() : undefined, expectedActivityId: history[history.length - 1]?.id });
  };
  const save = async () => {
    if (!review || lock.current) return;
    lock.current = true; setSaving(true); setError('');
    try { await query.change(booking.id, review); toast(`${OUTCOME_LABELS[action]} on this device. Sync will send the change when connected.`); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The change could not be saved. Your entries are still here.'); }
    finally { lock.current = false; setSaving(false); }
  };
  return <Sheet title={ACTION_LABELS[action]} eyebrow={booking.patient.name} onClose={onClose} closeDisabled={saving} hasUnsavedChanges={Boolean(reason || review || date !== calendarDate(booking.at) || time !== timeOf(booking.at))}>
    <p className="mb-4 text-sm text-ink-soft">{booking.reason} · {new Date(booking.at).toLocaleString('en-GB')}</p>
    {error ? <p ref={errorBox} tabIndex={-1} role="alert" className="mb-4 rounded-field border border-danger p-3 text-sm text-danger">{error}</p> : null}
    {review ? <div className="space-y-4"><h3 ref={reviewHeading} tabIndex={-1} className="font-extrabold">Review booking change</h3><dl className="space-y-3 text-sm"><div><dt className="font-bold">Patient</dt><dd>{booking.patient.name}<span className="block break-all font-mono text-xs">{booking.patient.id}</span></dd></div><div><dt className="font-bold">Action</dt><dd>{ACTION_LABELS[action]}</dd></div>{review.scheduledFor ? <div><dt className="font-bold">New date and time</dt><dd>{new Date(review.scheduledFor).toLocaleString('en-GB')}</dd></div> : null}{review.reason ? <div><dt className="font-bold">Reason</dt><dd className="whitespace-pre-wrap">{review.reason}</dd></div> : null}</dl><p className="text-sm text-ink-soft">This action is saved in the booking history with your name and time. Existing fees and payments remain on the patient's account.</p><Button loading={saving} disabled={saving} onClick={save}>Confirm {action === 'arrived' ? 'arrival' : action === 'rescheduled' ? 'reschedule' : action === 'reopened' ? 'reopening' : action === 'cancelled' ? 'cancellation' : 'no-show'}</Button><Button variant="outlined" disabled={saving} onClick={() => setReview(undefined)}>Back to edit</Button></div> : <div className="space-y-4">{action === 'rescheduled' ? <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><TextField label="New date" name="booking_new_date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /><TextField label="New time" name="booking_new_time" type="time" value={time} onChange={(event) => setTime(event.target.value)} /></div> : null}{action==='rescheduled'?<AllocationFields start={`${date}T${time}`} initial={booking.allocation} onChange={setResource}/>:null}<p className="text-sm text-ink-soft">{action === 'arrived' ? 'Record that the patient has arrived. This does not start a clinical visit or confirm payment.' : action === 'cancelled' ? 'Remove this booking from the active day list. Its history stays visible. Any waiver or refund must be recorded in Billing.' : action === 'no_show' ? 'Record that this due appointment was missed. An overdue appointment is never marked no-show automatically.' : action === 'rescheduled' ? 'Move this same booking to a new time. Its previous date stays in the history and its visit fees are not raised again.' : 'Return this booking to the active list. Its previous cancellation or no-show stays in the history.'}</p>{action !== 'arrived' ? <TextAreaField label="Reason for change" name="booking_change_reason" value={reason} onChange={(event) => setReason(event.target.value)} /> : null}<Button onClick={prepare}>Review change</Button><SheetCancelButton>Keep booking unchanged</SheetCancelButton></div>}
  </Sheet>;
};

const ResourcesSheet=({booking,zone,onClose}:{booking:BookedAppointment;zone:string;onClose:()=>void})=>{
  const context=useAuthorizationContext(),query=useAppointments(),[proposal,setProposal]=useState<AllocationProposal>({allocation:booking.allocation}),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <Sheet title="Change booking resources" eyebrow={booking.patient.name} onClose={onClose} closeDisabled={busy} hasUnsavedChanges={JSON.stringify(proposal.allocation)!==JSON.stringify(booking.allocation)}><p className="mb-4 text-sm text-ink-muted">Keep this booking's date, attendance and fees. Your new allocation remains a proposal until the server accepts it.</p><AllocationFields start={zonedInput(booking.at,zone)} startInstant={booking.at} initial={booking.allocation} onChange={setProposal}/>{error||proposal.error?<p role="alert" className="my-3 text-sm text-danger">{error||proposal.error}</p>:null}<Button disabled={busy||Boolean(proposal.error)} loading={busy} onClick={async()=>{setBusy(true);setError('');try{await reallocateAppointment(booking.id,proposal.allocation,booking.allocation,context);query.reload();onClose();}catch(cause){setError(cause instanceof Error?cause.message:'Resources could not be saved');}finally{setBusy(false);}}}>Save resource proposal</Button></Sheet>;
};

/** Shared by facility booking details and the patient's booking record. */
export const AppointmentActions = ({ booking }: { booking: BookedAppointment }) => {
  const context = useAuthorizationContext(), staff = useLiveQuery(listStaff),workforce=useWorkforce();
  const zone=workforce.data?.offerings.find((o)=>o.id===booking.allocation?.offeringId)?.timeZone;
  const [resources,setResources]=useState(false);
  const [action, setAction] = useState<AppointmentAction>();
  const inactive = bookingIsInactive(booking), history = booking.activity ?? [];
  const actions: AppointmentAction[] = inactive ? ['reopened', 'rescheduled'] : [
    ...(booking.attendance !== 'arrived' ? ['arrived' as const] : []), 'rescheduled', 'cancelled',
    ...(booking.attendance !== 'arrived' && new Date(booking.at).getTime() <= Date.now() ? ['no_show' as const] : []),
  ];
  return <section className="mt-5 space-y-4 border-t border-outline-soft pt-5" aria-label="Booking attendance and history"><ReservationStatus appointmentId={booking.id}/><div><h3 className="font-extrabold">{bookingAttendanceLabel(booking)}</h3>{!booking.encounterId && context.permissions.includes('appointment:update') ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{booking.scheduledFor&&!inactive?<Button variant="outlined" className="text-sm" disabled={!workforce.data} onClick={()=>setResources(true)}>Change resources</Button>:null}{actions.map((value) => <Button key={value} variant="outlined" className="text-sm" onClick={() => setAction(value)}>{ACTION_LABELS[value]}</Button>)}</div> : <p className="mt-2 text-sm text-ink-soft">{booking.encounterId ? 'Care is recorded in the linked visit. Booking attendance can no longer be changed.' : 'Your access allows you to review this booking.'}</p>}</div>
    {history.length ? <details className="rounded-field border border-outline-soft p-3"><summary className="min-h-[44px] cursor-pointer py-2 font-bold">Booking history ({history.length})</summary><ol className="mt-2 space-y-4">{[...history].reverse().map((event) => <li key={event.id} className="border-l-2 border-outline pl-3 text-sm"><p className="font-bold">{OUTCOME_LABELS[event.action]}</p><p className="mt-1 text-xs text-ink-muted">{new Date(event.recordedOn).toLocaleString('en-GB')} · <span className="break-words">{staff.data?.find((person) => person.staffId === event.recordedBy)?.fullName ?? event.recordedBy}</span></p>{event.action === 'rescheduled' ? <p className="mt-1">{event.fromScheduledFor ? new Date(event.fromScheduledFor).toLocaleString('en-GB') : 'Walk-in booking'} → {event.toScheduledFor ? new Date(event.toScheduledFor).toLocaleString('en-GB') : ''}</p> : null}{event.reason ? <p className="mt-1 whitespace-pre-wrap">{event.reason}</p> : null}</li>)}</ol></details> : <p className="text-xs text-ink-muted">No attendance or date changes recorded.</p>}
    {resources&&workforce.data?<ResourcesSheet booking={booking} zone={zone||workforce.data.facility?.timeZone||'Africa/Lagos'} onClose={()=>setResources(false)}/>:null}
    {action&&(!booking.allocation||workforce.data) ? <ChangeSheet key={`${booking.id}:${action}`} booking={booking} action={action} zone={zone} onClose={() => setAction(undefined)} /> : null}
  </section>;
};
