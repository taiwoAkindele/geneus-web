import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppBar, Button, ChoiceChip } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { APPOINTMENT_GROUP_LABELS, AppointmentWorklist, useAppointments, type AppointmentGroup, type BookedAppointment } from '@/features/appointments';
import { useAuthorizationContext } from '@/session';

export const AppointmentsScreen = () => {
  const navigate = useNavigate();
  const context = useAuthorizationContext();
  const { appointments, loading, error, reload } = useAppointments();
  const [group, setGroup] = useState<AppointmentGroup>('today');
  const canRecord = context.permissions.includes('encounter:record');
  const open = (appointment: BookedAppointment) => canRecord
    ? navigate('/encounters/record', { state: { patientId: appointment.patient.id, encounterId: appointment.encounterId, appointmentId: appointment.id } })
    : navigate('/patients/profile', { state: { patientId: appointment.patient.id } });
  const shown = appointments.filter((appointment) => appointment.group === group);

  return (
    <div className="min-h-screen bg-surface">
      <AppBar title="Appointments" onBack={() => navigate('/home')} right={<SyncPill />} />
      <div className="w-full space-y-4 px-5 py-3 md:px-8">
        <h1 className="text-[24px] font-extrabold tracking-[-0.02em]">Appointments</h1>
        <div className="flex flex-wrap gap-2" aria-label="Appointment groups">
          {(Object.keys(APPOINTMENT_GROUP_LABELS) as AppointmentGroup[]).map((key) => (
            <ChoiceChip key={key} selected={group === key} onClick={() => setGroup(key)}>
              {APPOINTMENT_GROUP_LABELS[key]}{!loading && !error ? ` · ${appointments.filter((appointment) => appointment.group === key).length}` : ''}
            </ChoiceChip>
          ))}
        </div>
        {loading ? <div role="status" className="h-32 animate-pulse rounded-card bg-surface-muted" aria-label="Loading appointments" /> : error ? (
          <div role="alert" className="rounded-card border border-outline-soft bg-white p-4"><p>Appointments could not be read from this device.</p><Button variant="ghost" onClick={reload}>Try again</Button></div>
        ) : shown.length === 0 ? (
          <p className="rounded-card border border-dashed border-outline p-5 text-center text-[14px] text-ink-muted">No {APPOINTMENT_GROUP_LABELS[group].toLowerCase()} appointments.</p>
        ) : <AppointmentWorklist appointments={shown} onOpen={open} actionLabel={canRecord ? 'Open encounter' : 'View patient'} />}
        <p className="text-xs leading-relaxed text-ink-muted">Appointments are grouped by their local calendar date. A linked encounter moves to Completed when care is closed.</p>
      </div>
    </div>
  );
};
