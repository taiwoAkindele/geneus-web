import { Navigate, Outlet } from 'react-router-dom';
import { useDeviceContext } from '@/data';
import { SyncingFacility } from './SyncingFacility';

/**
 * A device with no facility record has nothing to show and nothing to stamp
 * records with. Unenrolled, it can only register a facility; enrolled but not
 * yet synced, it waits — the facility exists on the server and is on its way.
 */
export const RequireFacility = () => {
  const { facility, enrolled } = useDeviceContext();
  if (facility) return <Outlet />;
  return enrolled ? <SyncingFacility /> : <Navigate to="/onboarding/start" replace />;
};
