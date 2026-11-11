import { Navigate, useLocation } from 'react-router-dom';
import type { RegistrationNavState } from '@/features/registration';

/**
 * Registration is one screen; its optional details sit under "More details".
 * This address is kept so bookmarks and an interrupted older session still
 * reach the form, with the same draft and editing state.
 */
export const NewPatientStep2Screen = () => {
  const state = (useLocation().state as RegistrationNavState) ?? {};
  return <Navigate to="/patients/new" state={state} replace />;
};
