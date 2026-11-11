import { useLocation, useSearchParams } from 'react-router-dom';
import { PatientProfile } from '@/modules/front-desk/patients/PatientProfile';
import { PatientDetails } from '@/modules/front-desk/patients/PatientDetails';
import { PatientChartAccess } from '@/modules/front-desk/patients/PatientChartAccess';
export type ProfileNavState = { patientId?: string } | null;
export const PatientProfileScreen = () => {
  const state = (useLocation().state as ProfileNavState) ?? {};
  const [params] = useSearchParams();
  const patientId = params.get('patient') ?? state.patientId;
  return !params.get('tab')||params.get('tab')==='details'?<PatientDetails key={patientId} patientId={patientId}/>:<PatientChartAccess><PatientProfile key={patientId} patientId={patientId}/></PatientChartAccess>;
};
