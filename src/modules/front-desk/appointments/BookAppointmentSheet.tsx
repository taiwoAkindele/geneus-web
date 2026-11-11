import { useState } from 'react';
import { Button, ChoiceChip, SegmentedControl, SelectField, Sheet, SheetCancelButton, TextField, useToast } from '@/ui';
import { calendarDate } from '@/lib/calendarDate';
import { BOOKING_SLOTS, bookingIsInactive, slotLoad } from './appointmentList';
import { VisitType } from '@shared';
import { VISIT_TYPE_LABELS } from '@/modules/finance/billing/feeForm';
import { useAppointments } from './AppointmentsProvider';
import type { AppointmentPatient } from './types';
import { AllocationFields, type AllocationProposal } from '@/modules/operations/workforce/AllocationFields';

const fmtDay = (iso: string) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '';
const DAY_CHOICES: readonly [number, string][] = [[0, 'Later today'], [1, 'Tomorrow'], [7, 'In 1 week'], [14, 'In 2 weeks'], [28, 'In 4 weeks']];
const dayFromToday = (days: number) => { const date = new Date(); date.setDate(date.getDate() + days); return calendarDate(date); };

/**
 * Book an appointment for a patient — for now (they join today's list as
 * pending) or scheduled ahead (upcoming). Booking adds the patient to the
 * encounters list for the chosen day (PRD §9.8).
 */
export const BookAppointmentSheet = ({ patient, onClose }: { patient: AppointmentPatient; onClose: () => void }) => {
  const { book, appointments, forPatient } = useAppointments();
  const toast = useToast();
  const [mode, setMode] = useState<'now' | 'scheduled'>('now');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('Consultation');
  const [visitType, setVisitType] = useState<VisitType>('general');
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');
  const [resource,setResource]=useState<AllocationProposal>({});

  const canBook = mode === 'now' || Boolean(date && time);
  const load = slotLoad(appointments, date);
  // An active booking of the same kind usually means this should be a reschedule, not a second booking.
  const existing = forPatient(patient.id).find((booking) => (booking.group === 'today' || booking.group === 'upcoming') && !bookingIsInactive(booking) && !booking.encounterId && (booking.visitType ?? 'general') === visitType);

  const submit = async () => {
    if (!canBook || booking) return;
    setBooking(true); setError('');
    try {
      if(mode==='scheduled'&&resource.error)throw new Error(resource.error);
      const scheduledFor = mode === 'scheduled' ? resource.scheduledFor||new Date(`${date}T${time}`).toISOString() : undefined;
      await book({ patientId: patient.id, reason: reason || 'Consultation', scheduledFor, visitType, allocation:mode==='scheduled'?resource.allocation:undefined });
      toast(
        scheduledFor
          ? `Appointment saved on this device for ${fmtDay(date)}`
          : 'Appointment saved on this device for now',
      );
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the appointment — your entries are still here.');
      setBooking(false);
    }
  };

  return (
    <Sheet onClose={onClose} eyebrow="Book an appointment" title={patient.name} placement="side" closeDisabled={booking} hasUnsavedChanges={mode !== 'now' || Boolean(date || time) || reason !== 'Consultation' || visitType !== 'general'}>
      <p className="mb-4 break-all font-mono text-sm text-ink-soft">{patient.id}</p>
      <SegmentedControl
        ariaLabel="When"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'now', label: 'Now' },
          { value: 'scheduled', label: 'Pick date & time' },
        ]}
      />

      {mode === 'scheduled' ? (
        <div className="mt-4 space-y-4">
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold text-ink-soft">Day</legend>
            <div className="flex flex-wrap gap-2">
              {DAY_CHOICES.map(([days, label]) => { const value = dayFromToday(days); return <ChoiceChip key={days} selected={date === value} onClick={() => { setDate(value); setTime(''); }}>{label}</ChoiceChip>; })}
            </div>
            <div className="mt-3"><TextField label="Or pick a date" name="appt_date" type="date" min={calendarDate()} value={date} onChange={(e) => setDate(e.target.value)} hint={date ? fmtDay(date) : undefined} /></div>
          </fieldset>
          {date ? (
            <fieldset>
              <legend className="mb-2 text-[13px] font-semibold text-ink-soft">Time · the number shows bookings already at that time</legend>
              <div className="flex flex-wrap gap-2">
                {BOOKING_SLOTS.map((slot) => { const past = new Date(`${date}T${slot}`).getTime() <= Date.now(); const count = load.get(slot) ?? 0; return past ? null : <ChoiceChip key={slot} selected={time === slot} onClick={() => setTime(slot)}>{slot}{count ? ` · ${count}` : ''}</ChoiceChip>; })}
              </div>
              <div className="mt-3 max-w-[200px]"><TextField label="Or type a time" name="appt_time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            </fieldset>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 rounded-card bg-brand-tint p-3.5 text-[13px] leading-relaxed text-brand">
          The booking is due today, ready for care. The visit begins when its first clinical entry is signed.
        </p>
      )}

      <div className="mt-4">
        <SelectField label="Visit type" value={visitType} options={VisitType.options.map((value) => ({ value, label: VISIT_TYPE_LABELS[value] }))} onChange={(e) => setVisitType(e.target.value as VisitType)} />
        <TextField label="Reason" name="appt_reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>

      {existing ? <p role="status" className="mt-4 rounded-field border border-amber-border bg-amber-bg p-3 text-sm text-amber-text">{patient.name} already has a {VISIT_TYPE_LABELS[visitType].toLowerCase()} booking on {existing.day} at {existing.when}. Saving adds another one; reschedule that booking instead if it is the same visit.</p> : null}
      {mode==='scheduled'?<div className="mt-4"><AllocationFields start={date&&time?`${date}T${time}`:''} onChange={setResource}/></div>:null}
      <div className="mt-5">
        {error ? <p role="alert" className="mb-3 text-sm text-danger">{error}</p> : null}
        <Button variant="primary" disabled={!canBook || booking} loading={booking} onClick={submit}>
          Save appointment
        </Button>
        <div className="mt-3"><SheetCancelButton disabled={booking} /></div>
        <p className="mt-3 text-sm text-ink-soft">A booking schedules care. It does not create a signed visit. Saved bookings sync when connected.</p>
      </div>
    </Sheet>
  );
};
