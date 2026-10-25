import { describe, expect, it } from 'vitest';
import { Appointment, Encounter, EncounterEntry, Patient } from '@shared';
import { projectAppointments } from './appointmentList';

const now = new Date(2026, 9, 22, 14);
const at = (day: number, hour = 10) => new Date(2026, 9, day, hour).toISOString();
const envelope = { facilityId: 'OOE-PHC', deviceId: 'device:1', createdBy: 'staff:1', createdOn: at(21), schemaVersion: 3 };
const patient = Patient.parse({ ...envelope, type: 'patient', id: 'OOE-PHC-000001-K2', patientId: 'OOE-PHC-000001-K2', fullName: 'Amaka', address: 'Ring Road', sex: 'female', ageYears: 32 });
const appointment = (id: string, day: number, scheduled = false) => Appointment.parse({
  ...envelope, id, type: 'appointment', patientId: patient.patientId, reason: 'Consultation',
  createdOn: at(day), status: scheduled ? 'scheduled' : 'pending', ...(scheduled ? { scheduledFor: at(day) } : {}),
});

describe('the working appointment day', () => {
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
});
