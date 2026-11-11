import { ActionMenu, Avatar, DataTable, Tag } from '@/ui';
import type { IconName } from '@/ui';
import { VISIT_TYPE_LABELS } from '@/modules/finance/billing/feeForm';
import { bookingStatus } from './appointmentList';
import type { BookedAppointment } from './types';

/** One entry in a row's action menu. */
export type RowMenuItem = { label: string; onSelect: () => void; icon?: IconName };

type Props = {
  appointments: readonly BookedAppointment[];
  /** The actions a row offers, opened from its ⋯ button (on hover with a mouse, or by click, tap or keyboard). */
  actions: (appointment: BookedAppointment) => RowMenuItem[];
};

const Status = ({ booking }: { booking: BookedAppointment }) => {
  const status = bookingStatus(booking);
  return <div className="flex flex-wrap items-center gap-1.5">
    <Tag tone={status.tone}>{status.label}</Tag>
    {booking.paymentStatus === 'Awaiting payment' ? <Tag tone="amber">Awaiting payment</Tag> : <span className="text-xs text-ink-muted">Fees settled</span>}
  </div>;
};

const visitLabel = (booking: BookedAppointment) => VISIT_TYPE_LABELS[booking.visitType ?? 'general'];
const Menu = ({ booking, actions }: { booking: BookedAppointment; actions: Props['actions'] }) =>
  <ActionMenu compact openOnHover label={`Actions for ${booking.patient.name}`} title={booking.patient.name} actions={actions(booking)} />;

/**
 * The appointment worklist. Every column has a fixed share of the width and
 * rows are centred, so values line up under their headings; the status is one
 * tag, and every action lives in the row's ⋯ menu.
 */
export const AppointmentWorklist = ({ appointments, actions }: Props) => (
  <>
    <ul className="space-y-2 lg:hidden" aria-label="Appointments">
      {appointments.map((booking) => (
        <li key={booking.id} className="flex items-start gap-3 rounded-card border border-outline-soft bg-white p-3.5">
          <Avatar tone="green" size="sm">{booking.patient.initials}</Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate font-bold text-ink">{booking.patient.name}</p>
              <p className="shrink-0 font-mono text-sm font-bold tabular-nums">{booking.when}</p>
            </div>
            <p className="mt-0.5 text-[13px] text-ink-muted">{booking.reason} · {visitLabel(booking)} · {booking.day}</p>
            <p className="mt-0.5 break-all font-mono text-[11px] text-ink-muted">{booking.patient.id}</p>
            <div className="mt-2"><Status booking={booking} /></div>
          </div>
          <Menu booking={booking} actions={actions} />
        </li>
      ))}
    </ul>
    <div className="hidden lg:block">
      <DataTable caption="Appointments" uniformHeaders centerRows rows={appointments} rowKey={(row) => row.id} columns={[
        { key: 'patient', label: 'Patient', className: 'w-[30%]', sortValue: (row) => row.patient.name, render: (row) => <div className="min-w-0"><p className="font-bold text-ink">{row.patient.name}</p><p className="break-all font-mono text-xs text-ink-muted">{row.patient.id}</p></div> },
        { key: 'when', label: 'When', className: 'w-[14%]', sortValue: (row) => row.at, render: (row) => <div><p className="font-mono font-bold tabular-nums">{row.when}</p><p className="text-xs text-ink-muted">{row.day}</p></div> },
        { key: 'visit', label: 'Visit', className: 'w-[22%]', render: (row) => <div><p>{row.reason}</p><p className="text-xs text-ink-muted">{visitLabel(row)}</p></div> },
        { key: 'status', label: 'Status', className: 'w-[28%]', render: (row) => <Status booking={row} /> },
        { key: 'actions', label: 'Actions', align: 'right', className: 'w-[6%]', render: (row) => <Menu booking={row} actions={actions} /> },
      ]} />
    </div>
  </>
);
