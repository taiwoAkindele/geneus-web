import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { workforceEnforcementActive } from '@shared';
import { SelectField, Button } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { selectedCareService, selectCareService } from '@/data/workforceClinical';
import { clearPrivateWorkforce } from '@/lib/api/workforce';
import { useLiveQuery } from '@/data';
import { loadCareContext } from '@/data/repos/workforce';
import { refreshWorkforceKeys } from '@/data/workforceAuthority';
export const CareContext = () => {
  const context = useAuthorizationContext(), query = useLiveQuery(loadCareContext), [selected, setSelected] = useState(() => selectedCareService(context)), [error, setError] = useState(''), [refreshing, setRefreshing] = useState(false);
  useEffect(() => { setSelected(selectedCareService(context)); return () => clearPrivateWorkforce(); }, [context.userId]);
  if (!context.permissions.includes('encounter:record') || !query.data)
    return null;
  const enforcing = workforceEnforcementActive(query.data.facility?.workforcePolicy, Date.now()), proof = query.data.snapshots.find((s) => s.staffId === context.userId);
  if (!enforcing && !proof?.reviewScopes.length)
    return null;
  return <aside className="border-b border-outline-soft bg-white px-4 py-3 md:px-8" aria-label="Current care context"><div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">{enforcing ? <div className="min-w-48 flex-1"><SelectField label="Care service" value={selected} onChange={(e) => { const value = e.target.value; setSelected(value); void selectCareService(context, value).catch(() => setError('Could not save your service choice. Choose it again before signing')); }} options={[{ value: '', label: 'Choose the service you are working in' }, ...query.data.offerings.filter((o) => o.configuration === 'active').map((o) => ({ value: o.id, label: o.name }))]} help={{ purpose: 'This records which service your clinical entries belong to. A device default or duty selection does not grant professional authority.' }} /></div> : null}<Link to="/clinical-reviews" className="inline-flex min-h-11 items-center text-sm font-bold text-brand underline">Clinical reviews & co-signatures</Link><Button fullWidth={false} variant="ghost" disabled={refreshing} loading={refreshing} onClick={async () => {
    setRefreshing(true); setError(''); try {
      await refreshWorkforceKeys();
      query.reload();
    }
      catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not refresh approval verification');
      }
      finally {
      setRefreshing(false);
    }
  }}>Refresh approvals</Button></div>{error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}</aside>;
};
