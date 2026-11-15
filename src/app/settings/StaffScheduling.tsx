import { useSearchParams } from 'react-router-dom';
import { SectionTabs } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { SignInWindows } from '@/modules/operations/staff/SignInWindows';
import { CoverageWorkspace } from '@/modules/operations/workforce/Workspaces';
import { schedulingPlanner } from './settingsTabs';

/**
 * Settings → Staff scheduling & coverage: facility-wide workforce planning.
 * Sign-in windows restrict when shift-based staff may sign in; Coverage plans
 * who staffs each service session (and is where clinicians open walk-in
 * intake). Each person's own windows and sessions are also shown, and
 * editable, on their Staff profile — the same records.
 */
export const StaffScheduling = () => {
  const [params, setParams] = useSearchParams();
  const planner = schedulingPlanner(useAuthorizationContext());
  const view = !planner || params.get('view') === 'coverage' ? 'coverage' : 'sign-in';
  return <div className="space-y-4">
    {planner ? <SectionTabs label="Staff scheduling sections" value={view} onChange={(next) => setParams(next === 'sign-in' ? {} : { view: next })}
      options={[{ value: 'sign-in', label: 'Sign-in windows' }, { value: 'coverage', label: 'Coverage' }]} /> : null}
    {view === 'coverage' ? <CoverageWorkspace /> : <SignInWindows />}
  </div>;
};
