import { useLocation, useSearchParams } from 'react-router-dom';
import { PatientProfile } from '@/features/patients/PatientProfile';
import { PatientDetails } from '@/features/patients/PatientDetails';
import { PatientChartAccess } from '@/features/patients/PatientChartAccess';
export type ProfileNavState = { patientId?: string } | null;
export const PatientProfileScreen = () => {
  const state = (useLocation().state as ProfileNavState) ?? {};
  const [params] = useSearchParams();
  const patientId = params.get('patient') ?? state.patientId;
  return !params.get('tab')||params.get('tab')==='details'?<PatientDetails key={patientId} patientId={patientId}/>:<PatientChartAccess><PatientProfile key={patientId} patientId={patientId}/></PatientChartAccess>;
};
