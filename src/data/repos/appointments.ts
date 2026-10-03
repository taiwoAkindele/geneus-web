import type { Appointment, AuthorizationContext } from '@shared';
import { allOfType, envelope, insertRecord, newId } from '../db';

export const listAppointments = () => allOfType<Appointment>('appointment');

export type AppointmentDraft = {
  patientId: string;
  reason: string;
  /** Absent books the patient for now; present schedules them ahead. */
  scheduledFor?: string;
};

/** The appointment record for a booking — also written alongside a follow-up that closes an encounter. */
export const newAppointment = (draft: AppointmentDraft, context: AuthorizationContext, createdOn?: string) => ({
  ...envelope(context, createdOn),
  id: newId('appointment'),
  type: 'appointment' as const,
  patientId: draft.patientId,
  reason: draft.reason,
  scheduledFor: draft.scheduledFor,
  status: draft.scheduledFor ? ('scheduled' as const) : ('pending' as const),
});

export const book = (draft: AppointmentDraft, context: AuthorizationContext, createdOn?: string) =>
  insertRecord<Appointment>(context, 'appointment:create', 'appointment', newAppointment(draft, context, createdOn));
