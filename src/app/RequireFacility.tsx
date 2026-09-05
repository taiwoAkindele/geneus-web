import { Navigate, Outlet } from 'react-router-dom';
import { useDeviceContext } from '@/data';

/**
 * A device with no facility document has nothing to show and nothing to stamp
 * documents with, so it can only register a facility.
 */
export const RequireFacility = () => {
  const { facility } = useDeviceContext();
  return facility ? <Outlet /> : <Navigate to="/onboarding/start" replace />;
};
