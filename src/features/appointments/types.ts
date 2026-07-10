/**
 * Appointments (PRD §9.8). A booking made from a patient's profile drops the
 * patient onto the encounters list for its day — "pending" when booked for now,
 * "upcoming" when scheduled ahead. Mock/local state for the prototype.
 */
export type AppointmentStatus = 'pending' | 'upcoming';

export type AppointmentPatient = { id: string; name: string; initials: string; allergy: string };

export type BookedAppointment = {
  id: string;
  patient: AppointmentPatient;
  reason: string;
  /** Day the appointment falls on — 'Today' or e.g. '16 Jul 2026'. */
  day: string;
  /** When, for display — 'Now' or e.g. '16 Jul · 10:00'. */
  when: string;
  status: AppointmentStatus;
};
