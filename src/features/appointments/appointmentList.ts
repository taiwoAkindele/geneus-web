import { CLOSING_STEPS, currentAllergies, linkedPatientIds, type ClinicalEvent, type PatientIdentityEvent, type Appointment, type BillingAdjustment, type Charge, type Payment, type Encounter, type EncounterEntry, type Patient } from '@shared';
import { isAppointmentConfirmed } from '@/data/repos/billing';
import { calendarDate } from '@/lib/calendarDate';
import type { AppointmentGroup, BookedAppointment } from './types';

export const APPOINTMENT_GROUP_LABELS: Record<AppointmentGroup, string> = {
  today: 'Today', overdue: 'Overdue', upcoming: 'Upcoming', completed: 'Completed', cancelled: 'Cancelled', no_show: 'No-show',
};

export const bookingIsInactive = (booking: Pick<BookedAppointment, 'attendance'>) => booking.attendance === 'cancelled' || booking.attendance === 'no_show';
export const bookingAttendanceLabel = (booking: Pick<BookedAppointment, 'group' | 'attendance' | 'encounterId'>) => booking.group === 'completed' ? 'Visit completed' : booking.encounterId ? 'Visit in progress' : ({ booked: 'Not arrived', arrived: 'Arrived', cancelled: 'Cancelled', no_show: 'No-show' }[booking.attendance ?? 'booked']);

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
    const group: AppointmentGroup = encounter && closedIds.has(encounter.id) ? 'completed' : appointment.attendance === 'cancelled' ? 'cancelled' : appointment.attendance === 'no_show' ? 'no_show' : day < today ? 'overdue' : day > today ? 'upcoming' : 'today';
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
      attendance: appointment.attendance, activity: appointment.activity, scheduledFor: appointment.scheduledFor, allocation: appointment.allocation, visitType: appointment.visitType,
      paymentStatus: isAppointmentConfirmed(appointment.id, charges, payments, adjustments, appointment.chargeIds) ? 'Confirmed' : 'Awaiting payment',
    };
  }).sort((a, b) => a.at.localeCompare(b.at));
};

/** The one inline action a worklist row offers, so routine front-desk work needs no detail sheet. */
export type QuickAction = 'arrive' | 'rebook';
export const quickActionFor = (booking: Pick<BookedAppointment, 'group' | 'attendance' | 'encounterId'>): QuickAction | undefined => {
  // Once care has started, or a booking is cancelled or a no-show, changes go through the booking details.
  if (booking.encounterId || bookingIsInactive(booking)) return undefined;
  // The booking contract cannot reverse an arrival; a mistaken one is rescheduled or cancelled from the booking details.
  if (booking.group === 'today') return booking.attendance === 'arrived' ? undefined : 'arrive';
  if (booking.group === 'overdue' && booking.attendance !== 'arrived') return 'rebook';
  return undefined;
};

/** Today's bookings as the desk works them: still expected, then arrived or already in care. */
export const splitToday = <T extends Pick<BookedAppointment, 'attendance' | 'encounterId'>>(bookings: readonly T[]) => ({
  expected: bookings.filter((booking) => booking.attendance !== 'arrived' && !booking.encounterId),
  arrived: bookings.filter((booking) => booking.attendance === 'arrived' || Boolean(booking.encounterId)),
});

/** Half-hour times offered when booking ahead; any other time can still be typed. */
export const BOOKING_SLOTS: readonly string[] = Array.from({ length: 16 }, (_, index) => `${String(8 + Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`);

const localTime = (at: string) => { const date = new Date(at); return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`; };

/** Active scheduled bookings already at each local time of one day. Information only; there is no capacity limit. */
export const slotLoad = (bookings: readonly Pick<BookedAppointment, 'scheduledFor' | 'attendance'>[], day: string): Map<string, number> => {
  const load = new Map<string, number>();
  for (const booking of bookings) {
    if (!booking.scheduledFor || bookingIsInactive(booking) || calendarDate(booking.scheduledFor) !== day) continue;
    const time = localTime(booking.scheduledFor);
    load.set(time, (load.get(time) ?? 0) + 1);
  }
  return load;
};
