import { useState } from 'react';
import { Button, SegmentedControl, Sheet, TextField, useToast } from '@/ui';
import { useAppointments } from './AppointmentsProvider';
import type { AppointmentPatient } from './types';

const fmtDay = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const fmtShort = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '';

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

  const canBook = mode === 'now' || Boolean(date && time);

  const submit = () => {
    if (!canBook) return;
    if (mode === 'now') {
      book({ patient, reason: reason || 'Consultation', day: 'Today', when: 'Now', status: 'pending' });
      toast('Appointment booked for now — added to today’s encounters list');
    } else {
      book({ patient, reason: reason || 'Consultation', day: fmtDay(date), when: `${fmtShort(date)} · ${time}`, status: 'upcoming' });
      toast(`Appointment booked for ${fmtDay(date)} — added to the encounters list`);
    }
    onClose();
  };

  return (
    <Sheet onClose={onClose} eyebrow="Book an appointment" title={patient.name}>
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
        <div className="mt-4 flex gap-3">
          <div className="flex-1">
            <TextField label="Date" name="appt_date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="w-32">
            <TextField label="Time" name="appt_time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-card bg-brand-tint p-3.5 text-[13px] leading-relaxed text-brand">
          The patient joins today’s encounters list as <b>pending</b>, ready to be seen now.
        </p>
      )}

      <div className="mt-4">
        <TextField label="Reason" name="appt_reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>

      <div className="mt-5">
        <Button variant="primary" disabled={!canBook} onClick={submit}>
          Book appointment
        </Button>
      </div>
    </Sheet>
  );
};
