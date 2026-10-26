import { useState } from 'react';
import { Button, SegmentedControl, SelectField, Sheet, SheetCancelButton, TextField, useToast } from '@/ui';
import { VisitType } from '@shared';
import { VISIT_TYPE_LABELS } from '@/features/billing/feeForm';
import { useAppointments } from './AppointmentsProvider';
import type { AppointmentPatient } from './types';

const fmtDay = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

/**
 * Book an appointment for a patient — for now (they join today's list as
 * pending) or scheduled ahead (upcoming). Booking adds the patient to the
 * encounters list for the chosen day (PRD §9.8).
 */
export const BookAppointmentSheet = ({ patient, onClose }: { patient: AppointmentPatient; onClose: () => void }) => {
  const { book } = useAppointments();
  const toast = useToast();
  const [mode, setMode] = useState<'now' | 'scheduled'>('now');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('Consultation');
  const [visitType, setVisitType] = useState<VisitType>('general');
  const [booking, setBooking] = useState(false);
  const [error, setError] = useState('');

  const canBook = mode === 'now' || Boolean(date && time);

  const submit = async () => {
    if (!canBook || booking) return;
    setBooking(true); setError('');
    try {
      const scheduledFor = mode === 'scheduled' ? new Date(`${date}T${time}`).toISOString() : undefined;
      await book({ patientId: patient.id, reason: reason || 'Consultation', scheduledFor, visitType });
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
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <TextField label="Date" name="appt_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="min-w-0">
            <TextField label="Time" name="appt_time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
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
