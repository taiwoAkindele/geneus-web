export {
  EMPTY_REGISTRATION,
  fromPatient,
  parseAge,
  toPatientDetails,
  type Religion,
  type RegistrationNavState,
  type RegistrationValues,
} from './registrationValues';
export { useNextPatientNumber } from './useNextPatientNumber';
export { useSavePatient, type RegistrationOutcome } from './useSavePatient';
export { amountsDue, factsFromForm, newPatientFees, visitFor, type FeeLine, type RegistrationVisit } from './visitFees';

export { RegistrationDraftProvider, useRegistrationDraft, useClearRegistrationDraft, useBeginRegistration } from './RegistrationDraftProvider';
