import { useCallback } from 'react';
import { useLiveQuery } from '@/data';
import { listPatientIds } from '@/data/repos/patients';
import { formatSequence, nextSequence } from '@/lib/patientId';
import { useAuthorizationContext } from '@/session';

/**
 * The ID a new registration will get, without its safety code — that is drawn
 * at the moment of saving (PRD §10.1). Live, so a patient registered on
 * another device and synced in moves the preview on.
 */
export const useNextPatientNumber = (): string | undefined => {
  const { facilityId } = useAuthorizationContext();
  const load = useCallback(async () => {
    const patientIds = await listPatientIds();
    return `${facilityId}-${formatSequence(nextSequence(facilityId, patientIds))}`;
  }, [facilityId]);
  return useLiveQuery(load, ['patient']).data;
};
