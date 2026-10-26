import { useLocation, useSearchParams } from 'react-router-dom';
import { PatientProfile } from '@/features/patients/PatientProfile';
export type ProfileNavState = { patientId?: string } | null;
export const PatientProfileScreen = () => {
  const state = (useLocation().state as ProfileNavState) ?? {};
  const [params] = useSearchParams();
  const patientId = params.get('patient') ?? state.patientId;
  return <PatientProfile key={patientId} patientId={patientId} />;
};
