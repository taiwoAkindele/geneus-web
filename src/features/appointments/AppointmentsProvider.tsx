import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext } from '@/session';
import { book, listAppointments } from '@/data/repos/appointments';
import { listPatients } from '@/data/repos/patients';
import { closingEntries, listEncounters } from '@/data/repos/encounters';
import { projectAppointments } from './appointmentList';
import { listCharges, listPayments, listAdjustments } from '@/data/repos/billing';
import type { BookedAppointment, NewAppointment } from './types';
import { linkedPatientIds } from '@shared';
import { listIdentityEvents } from '@/data/repos/patientIdentity';

type Value = {
  appointments: BookedAppointment[];
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
  book: (appointment: NewAppointment) => Promise<void>;
  forPatient: (patientId: string) => BookedAppointment[];
};
const AppointmentsContext = createContext<Value | null>(null);

export const AppointmentsProvider = ({ children }: { children: ReactNode }) => {
  const context = useAuthorizationContext();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = window.setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, []);

  const load = useCallback(async () => {
    const [appointments, patients, encounters, closing] = await Promise.all([listAppointments(), listPatients(), listEncounters(), closingEntries()]);
    const [charges, payments, adjustments] = await Promise.all([listCharges(), listPayments(), listAdjustments()]);
    return { appointments, patients, encounters, closing, charges, payments, adjustments, identityEvents: await listIdentityEvents() };
  }, []);
  const { data, loading, error, reload } = useLiveQuery(load);
  const appointments = useMemo(() => data ? projectAppointments(data.appointments, data.patients, data.encounters, data.closing, now, data.charges, data.payments, data.adjustments) : [], [data, now]);
  const bookAppointment = useCallback(async (appointment: NewAppointment) => { await book(appointment, context); }, [context]);
  const forPatient = useCallback((patientId: string) => { const ids = linkedPatientIds(patientId, data?.identityEvents ?? []); return appointments.filter((appointment) => ids.includes(appointment.patient.id)); }, [appointments, data]);
  const value = useMemo(() => ({ appointments, loading, error, reload, book: bookAppointment, forPatient }), [appointments, loading, error, reload, bookAppointment, forPatient]);
  return <AppointmentsContext.Provider value={value}>{children}</AppointmentsContext.Provider>;
};

export const useAppointments = (): Value => {
  const context = useContext(AppointmentsContext);
  if (!context) throw new Error('useAppointments must be used within an AppointmentsProvider');
  return context;
};
