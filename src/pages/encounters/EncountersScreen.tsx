import { Navigate, useSearchParams } from 'react-router-dom';
import { canReadPatientChart } from '@shared';
import { readDeviceStation } from '@/features/encounter';
import { useAuthorizationContext } from '@/session';

/**
 * The former combined visit list. Its queues now have their own request screens and
 * patients their own lists, so old links and a device's remembered queue land there.
 */
export const EncountersScreen = () => {
  const [params] = useSearchParams(), context = useAuthorizationContext();
  const station = params.get('queue') ?? readDeviceStation();
  const search = params.get('q') ? `?q=${encodeURIComponent(params.get('q')!)}` : '';
  if (station === 'lab') return <Navigate to={'/laboratory' + search} replace />;
  if (station === 'pharmacy') return <Navigate to={'/pharmacy' + search} replace />;
  // Results now arrive in the visit itself and alert the ordering clinician.
  if (station === 'results') return <Navigate to="/laboratory?tab=completed" replace />;
  const next = new URLSearchParams(params); next.delete('queue');
  // Clinical staff land on their patient list; front desk staff on theirs.
  return <Navigate to={(canReadPatientChart(context) ? '/clinical/patients' : '/patients/search') + (next.size ? '?' + next : '')} replace />;
};
