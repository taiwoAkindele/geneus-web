import { useLocation, useSearchParams } from 'react-router-dom';
import { PatientProfile, PatientDetails, PatientChartAccess } from '@/modules/front-desk/patients';

export type ProfileNavState = { patientId?: string } | null;

export const PatientProfileScreen = () => {
  const state = (useLocation().state as ProfileNavState) ?? {};
  const [params] = useSearchParams();
  const patientId = params.get('patient') ?? state.patientId;

  return !params.get('tab') || params.get('tab') === 'details' ? (
    <PatientDetails key={patientId} patientId={patientId} />
  ) : (
    <PatientChartAccess>
      <PatientProfile key={patientId} patientId={patientId} />
    </PatientChartAccess>
  );
};
