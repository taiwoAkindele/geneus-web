import { useNavigate } from 'react-router-dom';
import { AppBar, Avatar, StatusPill, Tag } from '@/ui';
import { useAppointments, type BookedAppointment } from '@/features/appointments';

const AppointmentRow = ({ appt, onOpen }: { appt: BookedAppointment; onOpen: () => void }) => (
  <button type="button" onClick={onOpen} className="w-full rounded-card border border-outline-soft bg-white p-4 text-left">
    <div className="flex items-center gap-3">
      <Avatar tone="green" size="sm">{appt.patient.initials}</Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold text-ink">{appt.patient.name}</div>
        <div className="text-[13px] text-ink-muted">{appt.reason}</div>
      </div>
      <Tag tone={appt.status === 'pending' ? 'amber' : 'slate'}>{appt.status === 'pending' ? 'Pending' : 'Upcoming'}</Tag>
    </div>
    <div className="mt-2.5 font-mono text-[11px] text-ink-muted">{appt.when} · {appt.day}</div>
  </button>
);

const EmptyState = ({ label }: { label: string }) => (
  <div className="rounded-card border border-dashed border-outline p-4 text-center text-[13px] text-ink-muted">{label}</div>
);

/**
 * Appointments (PRD §9.8). Booked from a patient's profile — "Now" bookings are
 * pending today, scheduled ones are upcoming. Same shared store the encounters
 * hub and each profile read from, so it always reflects what's been booked.
 */
export const AppointmentsScreen = () => {
  const navigate = useNavigate();
  const { appointments } = useAppointments();

  const today = appointments.filter((a) => a.status === 'pending');
  const upcoming = appointments.filter((a) => a.status === 'scheduled');

  // The patient has arrived → start their encounter.
  const start = (appt: BookedAppointment) => navigate('/encounters/record', { state: { patient: appt.patient } });

  return (
    <div className="min-h-screen bg-surface">
      <AppBar title="Appointments" onBack={() => navigate('/encounters')} right={<StatusPill status="synced" />} />
      <div className="w-full px-5 py-2 md:px-8">
        <div className="pb-1 font-mono text-[12px] uppercase tracking-[0.14em] text-brand-strong">Appointments</div>
        <h1 className="mb-4 text-[22px] font-extrabold tracking-[-0.02em]">Today &amp; upcoming</h1>

        <div className="grid gap-5 pb-24 lg:grid-cols-2">
          <section>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">Today · pending</span>
              <Tag tone="amber">To be seen</Tag>
            </div>
            <div className="space-y-2.5">
              {today.length > 0 ? (
                today.map((a) => <AppointmentRow key={a.id} appt={a} onOpen={() => start(a)} />)
              ) : (
                <EmptyState label="No patients waiting today." />
              )}
            </div>
          </section>

          <section>
            <div className="mb-3 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">Upcoming</div>
            <div className="space-y-2.5">
              {upcoming.length > 0 ? (
                upcoming.map((a) => <AppointmentRow key={a.id} appt={a} onOpen={() => start(a)} />)
              ) : (
                <EmptyState label="No upcoming appointments booked." />
              )}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-muted">
              An appointment booked from a patient's profile drops onto this list for its day, and onto the encounters
              list, ready to be started when the patient arrives.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
