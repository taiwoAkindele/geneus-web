import { useCallback } from 'react';
import type { Patient } from '@shared';
import { useLiveQuery, type LiveQuery } from '@/data';
import { getPatient, listPatients } from '@/data/repos/patients';

/** Every patient on the device, kept current as registrations sync in. */
export const usePatients = (): LiveQuery<Patient[]> => useLiveQuery(listPatients);

export const usePatient = (patientId: string | undefined): LiveQuery<Patient | undefined> => {
  const load = useCallback(
    async () => (patientId ? getPatient(patientId) : undefined),
    [patientId],
  );
  return useLiveQuery(load);
};
