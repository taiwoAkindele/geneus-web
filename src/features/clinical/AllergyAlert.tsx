import { useCallback } from 'react';
import { useLiveQuery } from '@/data';
import { clinicalEventsForPatient } from '@/data/repos/clinical';
import { patientIdentityIds } from '@/data/repos/patientIdentity';
import { getPatient } from '@/data/repos/patients';
import { currentAllergies } from '@shared';

export const AllergyAlert = ({ patientId }: { patientId: string }) => {
  const live = useLiveQuery(useCallback(async () => {
    const ids = await patientIdentityIds(patientId);
    const [groups, patients] = await Promise.all([Promise.all(ids.map(clinicalEventsForPatient)), Promise.all(ids.map(getPatient))]);
    return currentAllergies(groups.flat(), patients.filter((patient) => patient !== undefined));
  }, [patientId]));
  if (live.loading) return <span role="status" className="text-xs">Reading allergy records…</span>;
  if (live.error) return <button type="button" onClick={live.reload} className="rounded bg-amber-bg p-2 text-xs text-amber-text">Allergy records unavailable · retry</button>;
  return live.data?.length ? <span role="status" className="rounded-full bg-danger-bg px-3 py-1 text-xs font-bold text-danger-strong">Allergy: {live.data.map((allergy) => `${allergy.allergen} — ${allergy.reaction} (${allergy.severity})`).join('; ')}</span> : null;
};
