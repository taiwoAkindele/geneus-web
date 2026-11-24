import { Dashboard } from '@/app/dashboard/Dashboard';
import { ModuleGrid } from '@/app/dashboard/ModuleHome';
import { SetPasswordPrompt } from '@/app/screens/staff-onboarding/SetPasswordPrompt';

/** Home starts with today's work for this person, then the modules they can open. */
export const FacilityHomeScreen = () => (
  <>
    <SetPasswordPrompt />
    <Dashboard />
    <ModuleGrid />
  </>
);
