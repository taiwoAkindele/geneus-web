import { describe, expect, it } from 'vitest';
import { Appointment, ClinicalEvent, Encounter, EncounterEntry, Patient } from '@shared';
import { BOOKING_SLOTS, projectAppointments, quickActionFor, slotLoad, splitToday } from './appointmentList';

const now = new Date(2026, 9, 22, 14);
const at = (day: number, hour = 10) => new Date(2026, 9, day, hour).toISOString();
const envelope = { facilityId: 'OOE-PHC', deviceId: 'device:1', createdBy: 'staff:1', createdOn: at(21), schemaVersion: 3 };
const patient = Patient.parse({ ...envelope, type: 'patient', id: 'OOE-PHC-000001-K2', patientId: 'OOE-PHC-000001-K2', fullName: 'Amaka', address: 'Ring Road', sex: 'female', ageYears: 32 });
const appointment = (id: string, day: number, scheduled = false) => Appointment.parse({
  ...envelope, id, type: 'appointment', patientId: patient.patientId, reason: 'Consultation',
  createdOn: at(day), status: scheduled ? 'scheduled' : 'pending', ...(scheduled ? { scheduledFor: at(day) } : {}),
});

describe('the working appointment day', () => {
  it('uses structured allergy reviews in the worklist while retaining unreviewed legacy allergies', () => {
    const withLegacy = { ...patient, allergies: ['Penicillin', 'Sulfa'] };
    const review = ClinicalEvent.parse({ ...envelope, id: 'allergy:review', recordId: 'allergy:review', type: 'clinical_event', patientId: patient.patientId, actorRole: 'doctor', kind: 'allergy', values: { allergen: 'Penicillin', reaction: 'Reviewed', severity: 'unknown', verification: 'refuted', status: 'inactive' } });
    const rows = projectAppointments([appointment('allergy-booking', 22)], [withLegacy], [], [], now, [], [], [], [review]);
    expect(rows[0].patient.allergy).toBe('Sulfa');
    expect(withLegacy.allergies).toEqual(['Penicillin', 'Sulfa']);
  });

  it('puts yesterday in Overdue and a scheduled booking for today in Today', () => {
    const rows = projectAppointments([appointment('old', 21), appointment('today', 22, true), appointment('future', 23, true)], [patient], [], [], now);
    expect(rows.map(({ id, group }) => [id, group])).toEqual([['old', 'overdue'], ['today', 'today'], ['future', 'upcoming']]);
    expect(rows[0].when).not.toBe('Now');
  });

  it('uses the local calendar day around midnight rather than the UTC string prefix', () => {
    const localNow = new Date(2026, 9, 22, 0, 5);
    const booking = { ...appointment('early', 22, true), scheduledFor: new Date(2026, 9, 22, 0, 1).toISOString() };
    expect(projectAppointments([booking], [patient], [], [], localNow)[0].group).toBe('today');
  });

  it('moves a linked booking to Completed only when a closing step is saved', () => {
    const booking = appointment('appointment:1', 22);
    const encounter = Encounter.parse({ ...envelope, id: 'encounter:1', type: 'encounter', patientId: patient.patientId, appointmentId: booking.id, openedOn: at(22) });
    const closing = EncounterEntry.parse({ ...envelope, id: 'entry:1', type: 'encounter_entry', patientId: patient.patientId, encounterId: encounter.id, actorRole: 'nurse', step: 'follow_up', values: {} });
    expect(projectAppointments([booking], [patient], [encounter], [], now)[0]).toMatchObject({ group: 'today', encounterId: encounter.id });
    expect(projectAppointments([booking], [patient], [encounter], [closing], now)[0].group).toBe('completed');
  });
  it('does not confirm a booking before its linked charges have downloaded', () => {
    const booking = { ...appointment('appointment:pending-sync', 22), chargeIds: ['charge:registration'] };
    expect(projectAppointments([booking], [patient], [], [], now)[0].paymentStatus).toBe('Awaiting payment');
    expect(projectAppointments([{ ...booking, chargeIds: [] }], [patient], [], [], now)[0].paymentStatus).toBe('Confirmed');
  });
  it('removes cancelled and missed bookings from outstanding date groups while retaining their history', () => {
    const missed = Appointment.parse({ ...appointment('missed', 21), attendance: 'no_show', activity: [{ id: 'missed:action', action: 'no_show', fromAttendance: 'booked', toAttendance: 'no_show', reason: 'Patient did not attend', recordedBy: 'staff:one', recordedOn: at(22) }] });
    const cancelled = Appointment.parse({ ...appointment('cancelled', 23, true), createdOn: at(21), attendance: 'cancelled', activity: [{ id: 'cancelled:action', action: 'cancelled', fromAttendance: 'booked', toAttendance: 'cancelled', fromScheduledFor: at(23), toScheduledFor: at(23), reason: 'Patient request', recordedBy: 'staff:one', recordedOn: at(22) }] });
    const rows = projectAppointments([missed, cancelled], [patient], [], [], now);
    expect(rows.map((row) => row.group)).toEqual(['no_show', 'cancelled']);
    expect(rows[0].activity?.[0].reason).toBe('Patient did not attend');
    expect(rows.filter((row) => row.group === 'overdue' || row.group === 'today')).toHaveLength(0);
  });
});

describe('front-desk shortcuts on the appointment list', () => {
  it('offers arrival for today and rebooking for a missed booking, but no inline reversal of an arrival', () => {
    expect(quickActionFor({ group: 'today', attendance: 'booked' })).toBe('arrive');
    expect(quickActionFor({ group: 'today', attendance: undefined })).toBe('arrive');
    expect(quickActionFor({ group: 'today', attendance: 'arrived' })).toBeUndefined();
    expect(quickActionFor({ group: 'overdue', attendance: 'booked' })).toBe('rebook');
  });

  it('offers nothing once care has started, or for inactive, upcoming and completed bookings', () => {
    expect(quickActionFor({ group: 'today', attendance: 'arrived', encounterId: 'encounter:1' })).toBeUndefined();
    expect(quickActionFor({ group: 'today', attendance: 'cancelled' })).toBeUndefined();
    expect(quickActionFor({ group: 'overdue', attendance: 'no_show' })).toBeUndefined();
    expect(quickActionFor({ group: 'upcoming', attendance: 'booked' })).toBeUndefined();
    expect(quickActionFor({ group: 'completed', attendance: 'arrived' })).toBeUndefined();
  });

  it('splits today into expected and arrived, counting a started visit as arrived', () => {
    const rows = [{ id: 'a', attendance: 'booked' as const }, { id: 'b', attendance: 'arrived' as const }, { id: 'c', attendance: undefined, encounterId: 'encounter:1' }];
    const { expected, arrived } = splitToday(rows);
    expect(expected.map((row) => row.id)).toEqual(['a']);
    expect(arrived.map((row) => row.id)).toEqual(['b', 'c']);
  });

  it('counts active scheduled bookings per local time on one day only', () => {
    const day = '2026-10-23';
    const load = slotLoad([
      { scheduledFor: new Date(2026, 9, 23, 10, 30).toISOString(), attendance: 'booked' },
      { scheduledFor: new Date(2026, 9, 23, 10, 30).toISOString(), attendance: 'arrived' },
      { scheduledFor: new Date(2026, 9, 23, 10, 30).toISOString(), attendance: 'cancelled' },
      { scheduledFor: new Date(2026, 9, 24, 10, 30).toISOString(), attendance: 'booked' },
      { scheduledFor: undefined, attendance: 'booked' },
    ], day);
    expect([...load]).toEqual([['10:30', 2]]);
    expect(BOOKING_SLOTS[0]).toBe('08:00');
    expect(BOOKING_SLOTS[BOOKING_SLOTS.length - 1]).toBe('15:30');
  });
});
