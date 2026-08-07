import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { Appointment, Patient } from '@shared';
import { useLiveQuery, useWriteContext } from '@/data';
import { book, listAppointments } from '@/data/repos/appointments';
import { findPatient, listPatients } from '@/data/repos/patients';
import type { BookedAppointment, NewAppointment } from './types';

/**
 * Bookings made on a patient's profile, joined to that patient so the
 * encounters list can show who is coming. Appointment documents carry only the
 * patientId — the contract never duplicates patient details.
 */
type Value = {
  appointments: BookedAppointment[];
  loading: boolean;
  error: Error | undefined;
  book: (appointment: NewAppointment) => Promise<void>;
  forPatient: (patientId: string) => BookedAppointment[];
};

const AppointmentsContext = createContext<Value | null>(null);

const initialsOf = (fullName: string): string =>
  fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

const isToday = (iso: string): boolean => iso.slice(0, 10) === new Date().toISOString().slice(0, 10);

const project = (appointments: Appointment[], patients: Patient[]): BookedAppointment[] =>
  appointments
    .sort((a, b) => (b.scheduledFor ?? b.createdOn).localeCompare(a.scheduledFor ?? a.createdOn))
    .map((appointment) => {
      const patient = findPatient(patients, appointment.patientId);
      const at = appointment.scheduledFor ?? appointment.createdOn;
      const time = new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      return {
        id: appointment._id,
        patient: {
          id: appointment.patientId,
          name: patient?.fullName ?? 'Unknown patient',
          initials: patient ? initialsOf(patient.fullName) : '??',
          allergy: patient?.allergies[0] ?? 'None recorded',
        },
        reason: appointment.reason,
        day: isToday(at)
          ? 'Today'
          : new Date(at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
        when: appointment.status === 'pending' ? 'Now' : `${new Date(at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} · ${time}`,
        status: appointment.status,
      };
    });

export const AppointmentsProvider = ({ children }: { children: ReactNode }) => {
  const context = useWriteContext();

  const load = useCallback(async () => {
    const [appointments, patients] = await Promise.all([listAppointments(), listPatients()]);
    return project(appointments, patients);
  }, []);

  const { data, loading, error } = useLiveQuery(load);
  const appointments = useMemo(() => data ?? [], [data]);

  const bookAppointment = useCallback(
    async (appointment: NewAppointment) => {
      await book(appointment, context);
    },
    [context],
  );

  const forPatient = useCallback(
    (patientId: string) => appointments.filter((appointment) => appointment.patient.id === patientId),
    [appointments],
  );

  const value = useMemo<Value>(
    () => ({ appointments, loading, error, book: bookAppointment, forPatient }),
    [appointments, loading, error, bookAppointment, forPatient],
  );

  return <AppointmentsContext.Provider value={value}>{children}</AppointmentsContext.Provider>;
};

export const useAppointments = (): Value => {
  const context = useContext(AppointmentsContext);
  if (!context) throw new Error('useAppointments must be used within an AppointmentsProvider');
  return context;
};
