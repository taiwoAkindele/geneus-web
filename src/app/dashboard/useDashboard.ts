import { useCallback, useEffect, useState } from 'react';
import { useLiveQuery } from '@/data';
import { listEncounters, listEncounterEntries } from '@/data/repos/encounters';
import { listPatients } from '@/data/repos/patients';
import { listCharges, listPayments, listAdjustments } from '@/data/repos/billing';
import { calendarDate } from '@/lib/calendarDate';
import { billingSnapshot, careSnapshot, type dashboardAccess } from './dashboardModel';

export const useDashboard = (access: ReturnType<typeof dashboardAccess>) => {
  const [today, setToday] = useState(calendarDate);
  useEffect(() => {
    const refresh = () => setToday(calendarDate());
    const timer = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const care = useLiveQuery(useCallback(async () => {
    if (!access.care) return undefined;
    const [encounters, entries, patients] = await Promise.all([listEncounters(), listEncounterEntries(), listPatients()]);
    return careSnapshot(encounters, entries, patients, today);
  }, [access.care, today]));
  const billing = useLiveQuery(useCallback(async () => {
    if (!access.billing) return undefined;
    const [charges, payments, adjustments, patients] = await Promise.all([listCharges(), listPayments(), listAdjustments(), listPatients()]);
    return billingSnapshot(charges, payments, adjustments, patients, today);
  }, [access.billing, today]));
  return { care, billing, today };
};
