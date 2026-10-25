import { CLOSING_STEPS, currentAllergies, linkedPatientIds, type ClinicalEvent, type PatientIdentityEvent, type Appointment, type BillingAdjustment, type Charge, type Payment, type Encounter, type EncounterEntry, type Patient } from '@shared';
import { isAppointmentConfirmed } from '@/data/repos/billing';
import { calendarDate } from '@/lib/calendarDate';
import type { AppointmentGroup, BookedAppointment } from './types';

export const APPOINTMENT_GROUP_LABELS: Record<AppointmentGroup, string> = {
  today: 'Today', overdue: 'Overdue', upcoming: 'Upcoming', completed: 'Completed',
};

export const projectAppointments = (
  appointments: readonly Appointment[], patients: readonly Patient[],
  encounters: readonly Encounter[], closingEntries: readonly EncounterEntry[], now = new Date(),
  charges: readonly Charge[] = [], payments: readonly Payment[] = [], adjustments: readonly BillingAdjustment[] = [],
  clinicalEvents: readonly ClinicalEvent[] = [], identityEvents: readonly PatientIdentityEvent[] = [],
): BookedAppointment[] => {
  const today = calendarDate(now);
  const patientById = new Map(patients.map((patient) => [patient.patientId, patient]));
  const closedIds = new Set(closingEntries.filter((entry) => (CLOSING_STEPS as readonly string[]).includes(entry.step)).map((entry) => entry.encounterId));
  const byAppointment = new Map(encounters.filter((encounter) => encounter.appointmentId).map((encounter) => [encounter.appointmentId!, encounter]));
  const clinicalByPatient = new Map<string, ClinicalEvent[]>();
  for (const event of clinicalEvents) clinicalByPatient.set(event.patientId, [...(clinicalByPatient.get(event.patientId) ?? []), event]);
  return appointments.map((appointment): BookedAppointment => {
    const patient = patientById.get(appointment.patientId);
    const ids = linkedPatientIds(appointment.patientId, identityEvents);
    const allergyEvents = ids.flatMap((id) => clinicalByPatient.get(id) ?? []);
    const allergyPatients = ids.flatMap((id) => patientById.get(id) ? [patientById.get(id)!] : []);
    const allergies = currentAllergies(allergyEvents, allergyPatients);
    const at = appointment.scheduledFor ?? appointment.createdOn;
    const day = calendarDate(at);
    const encounter = byAppointment.get(appointment.id);
    const group: AppointmentGroup = encounter && closedIds.has(encounter.id) ? 'completed' : day < today ? 'overdue' : day > today ? 'upcoming' : 'today';
    return {
      id: appointment.id,
      patient: {
        id: appointment.patientId, name: patient?.fullName ?? 'Patient not available on this device',
        initials: patient?.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('') ?? '??',
        allergy: allergies.map((allergy) => allergy.allergen).join(', ') || 'None recorded',
      },
      reason: appointment.reason,
      day: day === today ? 'Today' : new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      when: new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
      at, group, encounterId: encounter?.id, status: appointment.status,
      paymentStatus: isAppointmentConfirmed(appointment.id, charges, payments, adjustments, appointment.chargeIds) ? 'Confirmed' : 'Awaiting payment',
    };
  }).sort((a, b) => a.at.localeCompare(b.at));
};
