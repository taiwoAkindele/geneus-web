import { CLOSING_STEPS, type Appointment, type Encounter, type EncounterEntry, type Patient } from '@shared';
import { calendarDate } from '@/lib/calendarDate';
import type { AppointmentGroup, BookedAppointment } from './types';

export const APPOINTMENT_GROUP_LABELS: Record<AppointmentGroup, string> = {
  today: 'Today', overdue: 'Overdue', upcoming: 'Upcoming', completed: 'Completed',
};

export const projectAppointments = (
  appointments: readonly Appointment[], patients: readonly Patient[],
  encounters: readonly Encounter[], closingEntries: readonly EncounterEntry[], now = new Date(),
): BookedAppointment[] => {
  const today = calendarDate(now);
  const patientById = new Map(patients.map((patient) => [patient.patientId, patient]));
  const closedIds = new Set(closingEntries.filter((entry) => (CLOSING_STEPS as readonly string[]).includes(entry.step)).map((entry) => entry.encounterId));
  const byAppointment = new Map(encounters.filter((encounter) => encounter.appointmentId).map((encounter) => [encounter.appointmentId!, encounter]));
  return appointments.map((appointment): BookedAppointment => {
    const patient = patientById.get(appointment.patientId);
    const at = appointment.scheduledFor ?? appointment.createdOn;
    const day = calendarDate(at);
    const encounter = byAppointment.get(appointment.id);
    const group: AppointmentGroup = encounter && closedIds.has(encounter.id) ? 'completed' : day < today ? 'overdue' : day > today ? 'upcoming' : 'today';
    return {
      id: appointment.id,
      patient: {
        id: appointment.patientId, name: patient?.fullName ?? 'Patient not available on this device',
        initials: patient?.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('') ?? '??',
        allergy: patient?.allergies[0] ?? 'None recorded',
      },
      reason: appointment.reason,
      day: day === today ? 'Today' : new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      when: new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      at, group, encounterId: encounter?.id, status: appointment.status,
    };
  }).sort((a, b) => a.at.localeCompare(b.at));
};
