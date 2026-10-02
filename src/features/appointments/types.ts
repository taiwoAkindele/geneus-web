import type { AppointmentStatus } from '@shared';

/**
 * Appointments (PRD §9.8). A booking made from a patient's profile drops the
 * patient onto the encounters list for its day — "pending" when booked for now,
 * "scheduled" when booked ahead.
 */
export type { AppointmentStatus };

export type AppointmentPatient = { id: string; name: string; initials: string; allergy: string };

/** What the screens render: an appointment joined to its patient. */
export type BookedAppointment = {
  id: string;
  patient: AppointmentPatient;
  reason: string;
  /** Day it falls on, for display — 'Today' or e.g. '16 Jul 2026'. */
  day: string;
  /** When, for display — 'Now' or e.g. '16 Jul · 10:00'. */
  when: string;
  status: AppointmentStatus;
};

export type NewAppointment = {
  patientId: string;
  reason: string;
  /** Absent books the patient for now; present schedules them ahead. */
  scheduledFor?: string;
};
