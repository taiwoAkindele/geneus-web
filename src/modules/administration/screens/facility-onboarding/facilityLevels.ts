import type { FacilityDetails } from '@shared';

/** How a level of care is named on screens that show a facility's details (as the registration form names them). */
export const FACILITY_LEVEL_LABELS: Record<FacilityDetails['level'], string> = {
  phc: 'Primary',
  general_hospital: 'Secondary',
  teaching_hospital: 'Tertiary',
  chc: 'Community health centre',
  specialist: 'Specialist',
};
