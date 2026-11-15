import { Navigate, useSearchParams } from 'react-router-dom';
import { ManageStaffScreen } from '@/modules/administration/screens/facility-onboarding/ManageStaffScreen';

/**
 * Staff: the directory of people. Facility-wide planning that used to be a
 * tab here now lives in Settings; its earlier addresses follow it there.
 */
export const StaffDirectoryScreen = () => {
  const [params] = useSearchParams();
  const view = params.get('view');
  const date = params.get('date');
  if (view === 'roster') return <Navigate to="/settings/scheduling" replace />;
  if (view === 'coverage') return <Navigate to={`/settings/scheduling?view=coverage${date ? `&date=${encodeURIComponent(date)}` : ''}`} replace />;
  if (view === 'facilities') return <Navigate to="/settings/organization" replace />;
  if (view === 'emails' || view === 'directory') return <Navigate to="/admin/staff" replace />;
  return <ManageStaffScreen />;
};
