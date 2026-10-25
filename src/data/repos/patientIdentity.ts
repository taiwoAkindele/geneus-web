import { linkedPatientIds, type AuthorizationContext, type PatientIdentityEvent } from '@shared';
import { allOfType, envelope, insertRecord, newId, type NewRecord } from '../db';

export const listIdentityEvents = () => allOfType<PatientIdentityEvent>('patient_identity_event');
export const patientIdentityIds = async (patientId: string): Promise<string[]> => linkedPatientIds(patientId, await listIdentityEvents());

export type RegistrationDecision = { candidateIds: string[]; outcome: 'registration_distinct' | 'review_requested'; reason: string };
export const identityReviewRecords = (patientId: string, decision: RegistrationDecision | undefined, context: AuthorizationContext): NewRecord[] =>
  (decision?.candidateIds ?? []).map((otherPatientId) => ({
    permission: 'patient_identity:review', type: 'patient_identity_event', record: {
      ...envelope(context), id: newId('patient_identity_event'), type: 'patient_identity_event', patientId,
      otherPatientId, outcome: decision!.outcome, reason: decision!.reason.trim(),
    },
  }));

export const recordExistingSelection = (patientId: string, context: AuthorizationContext) =>
  insertRecord<PatientIdentityEvent>(context, 'patient_identity:review', 'patient_identity_event', {
    ...envelope(context), id: newId('patient_identity_event'), type: 'patient_identity_event', patientId,
    outcome: 'existing_selected', reason: 'Registration desk confirmed this existing patient record',
  });

export const requestIdentityReview = (patientId: string, otherPatientId: string, reason: string, context: AuthorizationContext) =>
  insertRecord<PatientIdentityEvent>(context, 'patient_identity:review', 'patient_identity_event', {
    ...envelope(context), id: newId('patient_identity_event'), type: 'patient_identity_event', patientId,
    otherPatientId, outcome: 'review_requested', reason: reason.trim(),
  });
