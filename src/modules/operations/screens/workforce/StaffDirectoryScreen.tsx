import { useSearchParams } from 'react-router-dom';
import { CoverageWorkspace } from '@/modules/operations/workforce/Workspaces';
import { ManageStaffScreen } from '@/modules/administration/screens/facility-onboarding/ManageStaffScreen';
export const StaffDirectoryScreen = () => { const [params] = useSearchParams(); return params.get('view') === 'coverage' ? <CoverageWorkspace /> : <ManageStaffScreen />; };
