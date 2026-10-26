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
  return live.data?.length ? <span role="status" className="inline-block rounded-field bg-danger-bg px-3 py-2 text-sm font-bold text-danger-strong">{live.data.some((allergy) => allergy.verification === 'reported') ? 'Reported allergy' : 'Allergy'}: {live.data.map((allergy) => `${allergy.allergen} — ${allergy.reaction} (${allergy.severity})`).join('; ')} · {live.data.length} recorded{live.data.some((allergy) => allergy.legacy || allergy.verification === 'reported') ? ' · needs review' : ''}</span> : <span role="status" className="inline-block rounded-field bg-amber-bg px-3 py-2 text-sm text-amber-text">Allergy status needs clinical review</span>;
};
