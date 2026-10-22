import { useLocation } from 'react-router-dom';
import { PatientProfile } from '@/features/patients/PatientProfile';
export type ProfileNavState = { patientId?: string } | null;
export const PatientProfileScreen = () => {
  const { patientId } = (useLocation().state as ProfileNavState) ?? {};
  return <PatientProfile patientId={patientId} />;
};
