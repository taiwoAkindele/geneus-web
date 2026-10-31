import { useCallback, useEffect } from 'react';
import { useLiveQuery } from '@/data';
import { loadInpatient } from '@/data/repos/inpatient';
export const useInpatient = () => {
  const query = useLiveQuery(useCallback(loadInpatient, []));
  useEffect(() => { const refresh = () => query.reload(); window.addEventListener('geneus:inpatientSupport', refresh); return () => window.removeEventListener('geneus:inpatientSupport', refresh); }, [query.reload]);
  return query;
};
