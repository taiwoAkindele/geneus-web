import { Avatar, Button, DataTable, Tag } from '@/ui';
import { APPOINTMENT_GROUP_LABELS } from './appointmentList';
import type { BookedAppointment } from './types';

type Props = { appointments: readonly BookedAppointment[]; onOpen: (appointment: BookedAppointment) => void; actionLabel: string };
export const AppointmentWorklist = ({ appointments, onOpen, actionLabel }: Props) => (
  <>
    <div className="space-y-2 lg:hidden">
      {appointments.map((appointment) => (
        <button key={appointment.id} type="button" onClick={() => onOpen(appointment)} className="flex w-full items-center gap-3 rounded-card border border-outline-soft bg-white p-3.5 text-left">
          <Avatar tone="green" size="sm">{appointment.patient.initials}</Avatar>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-ink">{appointment.patient.name}</div>
            <div className="text-[13px] text-ink-muted">{appointment.reason} · {appointment.day} {appointment.when}</div>
            <div className="mt-1 font-mono text-[11px] text-ink-muted">{appointment.patient.id}</div>
            {appointment.paymentStatus === 'Awaiting payment' ? <p className="mt-1 text-xs font-bold text-amber-text">Awaiting payment · care can continue</p> : null}
          </div>
          <Tag tone={appointment.group === 'overdue' ? 'amber' : appointment.group === 'completed' ? 'green' : 'slate'}>{APPOINTMENT_GROUP_LABELS[appointment.group]}</Tag>
        </button>
      ))}
    </div>
    <div className="hidden lg:block">
      <DataTable caption="Appointments" rows={appointments} rowKey={(row) => row.id} columns={[
        { key: 'patient', label: 'Patient', sortValue: (row) => row.patient.name, render: (row) => <div><button type="button" className="min-h-0 py-1 text-left font-bold text-brand underline-offset-2 hover:underline" onClick={() => onOpen(row)}>{row.patient.name}</button><div className="font-mono text-[11px] text-ink-muted">{row.patient.id}</div></div> },
        { key: 'when', label: 'Date & time', sortValue: (row) => row.at, render: (row) => <div>{row.day}<div className="text-ink-muted">{row.when}</div></div> },
        { key: 'reason', label: 'Reason', render: (row) => row.reason },
        { key: 'status', label: 'Status', render: (row) => APPOINTMENT_GROUP_LABELS[row.group] },
        { key: 'payment', label: 'Payment', render: (row) => row.paymentStatus ?? 'Confirmed' },
        { key: 'action', label: 'Action', render: (row) => <Button variant="ghost" fullWidth={false} className="px-2 py-2" onClick={() => onOpen(row)}>{actionLabel}</Button> },
      ]} />
    </div>
  </>
);
