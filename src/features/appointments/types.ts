import type { AppointmentStatus, AppointmentAttendance, AppointmentActivity, AppointmentAllocation, VisitType } from '@shared';

/**
 * Appointments (PRD §9.8). A booking made from a patient's profile drops the
 * patient onto the encounters list for its day — "pending" when booked for now,
 * "scheduled" when booked ahead.
 */
export type { AppointmentStatus };
export type AppointmentGroup = 'today' | 'overdue' | 'upcoming' | 'completed' | 'cancelled' | 'no_show';

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
  attendance?: AppointmentAttendance;
  activity?: AppointmentActivity[];
  allocation?: AppointmentAllocation;
  scheduledFor?: string;
  at: string;
  group: AppointmentGroup;
  encounterId?: string;
  paymentStatus?: 'Awaiting payment' | 'Confirmed';
};

export type NewAppointment = {
  allocation?: AppointmentAllocation;
  patientId: string;
  reason: string;
  /** Absent books the patient for now; present schedules them ahead. */
  scheduledFor?: string;
  visitType?: VisitType;
};
