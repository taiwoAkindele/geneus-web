import { Appointment } from '@shared';
import { allOfType, envelope, newId, put, type WriteContext } from '../db';

export const listAppointments = () => allOfType<Appointment>('appointment');

export type AppointmentDraft = {
  patientId: string;
  reason: string;
  /** Absent books the patient for now; present schedules them ahead. */
  scheduledFor?: string;
};

export const book = (draft: AppointmentDraft, context: WriteContext, createdOn?: string) =>
  put(
    Appointment.parse({
      ...envelope(context, createdOn),
      _id: newId('appointment'),
      type: 'appointment',
      patientId: draft.patientId,
      reason: draft.reason,
      scheduledFor: draft.scheduledFor,
      status: draft.scheduledFor ? 'scheduled' : 'pending',
    }),
  );
