import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import type { BookedAppointment } from './types';

/**
 * Shared appointments state so a booking on a patient's profile appears on the
 * encounters list (and in that patient's own Appointments section). When the
 * real data layer lands this becomes a repository; the API stays the same.
 */
type NewAppointment = Omit<BookedAppointment, 'id'>;

type Value = {
  appointments: BookedAppointment[];
  book: (appointment: NewAppointment) => void;
  /** Just this patient's appointments, newest first. */
  forPatient: (patientId: string) => BookedAppointment[];
};

const AppointmentsContext = createContext<Value | null>(null);

const SEED: BookedAppointment[] = [
  {
    id: 'ap-seed-1',
    patient: { id: 'OOE-PHC-000047-K2', name: 'Amaka Okoro', initials: 'AO', allergy: 'Penicillin' },
    reason: 'Malaria recovery review',
    day: '16 Jul 2026',
    when: '16 Jul · 10:00',
    status: 'upcoming',
  },
  {
    id: 'ap-seed-2',
    patient: { id: 'OOE-PHC-000051-B7', name: 'Ibrahim Musa', initials: 'IM', allergy: 'Sulfa drugs' },
    reason: 'BP check',
    day: 'Today',
    when: '11:00',
    status: 'pending',
  },
];

export const AppointmentsProvider = ({ children }: { children: ReactNode }) => {
  const [appointments, setAppointments] = useState<BookedAppointment[]>(SEED);
  const nextId = useRef(0);

  const book = useCallback((appointment: NewAppointment) => {
    setAppointments((list) => [{ ...appointment, id: `ap-${nextId.current++}` }, ...list]);
  }, []);

  const forPatient = useCallback(
    (patientId: string) => appointments.filter((a) => a.patient.id === patientId),
    [appointments],
  );

  const value = useMemo<Value>(() => ({ appointments, book, forPatient }), [appointments, book, forPatient]);

  return <AppointmentsContext.Provider value={value}>{children}</AppointmentsContext.Provider>;
};

export const useAppointments = (): Value => {
  const ctx = useContext(AppointmentsContext);
  if (!ctx) throw new Error('useAppointments must be used within an AppointmentsProvider');
  return ctx;
};
