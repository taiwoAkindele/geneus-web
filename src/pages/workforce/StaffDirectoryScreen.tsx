import { useSearchParams } from 'react-router-dom';
import { CoverageWorkspace } from '@/features/workforce/Workspaces';
import { ManageStaffScreen } from '@/pages/facility-onboarding/ManageStaffScreen';
export const StaffDirectoryScreen = () => { const [params] = useSearchParams(); return params.get('view') === 'coverage' ? <CoverageWorkspace /> : <ManageStaffScreen />; };
