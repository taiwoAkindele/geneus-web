import { useSearchParams } from 'react-router-dom';
import { CoverageWorkspace } from '@/modules/operations/workforce/Workspaces';
import { ManageStaffScreen } from '@/modules/administration/screens/facility-onboarding/ManageStaffScreen';
import { StaffFacilityAssignments } from '@/modules/administration/screens/facilities/StaffFacilityAssignments';
import { EmailConfirmationsCard } from '@/modules/administration/screens/facility-onboarding/EmailConfirmationsCard';
import { StaffSectionPage } from '@/modules/operations/staff/StaffSections';
import { useAuthorizationContext } from '@/session';

/** The Staff module: one page, one section per ?view= (directory, sign-in windows, coverage, facility assignments, email confirmations). */
export const StaffDirectoryScreen = () => {
  const [params] = useSearchParams();
  const manage = useAuthorizationContext().permissions.includes('staff:manage');
  const view = params.get('view');
  if (view === 'coverage') return <CoverageWorkspace />;
  if (view === 'facilities' && manage) return <StaffSectionPage view="facilities"><StaffFacilityAssignments /></StaffSectionPage>;
  if (view === 'emails' && manage) return <StaffSectionPage view="emails"><EmailConfirmationsCard /></StaffSectionPage>;
  return <ManageStaffScreen />;
};
