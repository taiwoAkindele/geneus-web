import { PatientChartAccess } from '@/modules/front-desk/patients';
import { ClinicalReviews } from '@/modules/operations/workforce';

export const ClinicalReviewsScreen = () => (
  <PatientChartAccess>
    <ClinicalReviews />
  </PatientChartAccess>
);
