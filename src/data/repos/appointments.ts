import type { Appointment, AuthorizationContext } from '@shared';
import { allOfType, envelope, insertRecord, newId } from '../db';

export const listAppointments = () => allOfType<Appointment>('appointment');

export type AppointmentDraft = {
  patientId: string;
  reason: string;
  /** Absent books the patient for now; present schedules them ahead. */
  scheduledFor?: string;
};

export const book = (draft: AppointmentDraft, context: AuthorizationContext, createdOn?: string) =>
  insertRecord<Appointment>(context, 'appointment:create', 'appointment', {
    ...envelope(context, createdOn),
    id: newId('appointment'),
    type: 'appointment',
    patientId: draft.patientId,
    reason: draft.reason,
    scheduledFor: draft.scheduledFor,
    status: draft.scheduledFor ? 'scheduled' : 'pending',
  });
