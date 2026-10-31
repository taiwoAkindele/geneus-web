import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerPatient, updatePatient } from '@/data/repos/patients';
import { useAuthorizationContext } from '@/session';
import { useToast } from '@/ui';
import { useClearRegistrationDraft } from './RegistrationDraftProvider';
import { toPatientDetails, type RegistrationValues } from './registrationValues';
import { identityReviewRecords, type RegistrationDecision } from '@/data/repos/patientIdentity';

/**
 * Saves the registration form — a new patient, or the one being edited — then
 * opens their profile. Shared by the form and the duplicate check, which both
 * end in the same save.
 */
export const useSavePatient = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const context = useAuthorizationContext();
  const clearDraft = useClearRegistrationDraft();
  const saving = useRef(false);

  return useCallback(
    async (values: RegistrationValues, editingPatientId?: string, decision?: RegistrationDecision) => {
      if (saving.current) return;
      saving.current = true;
      try {
        const details = toPatientDetails(values);
        const patient = editingPatientId
          ? await updatePatient(editingPatientId, details, context)
          : await registerPatient(details, context, (patientId) => identityReviewRecords(patientId, decision, context));
        toast(editingPatientId ? 'Patient details saved' : `Registered — ${patient.patientId}`);
        try { await clearDraft(editingPatientId ?? 'new'); }
        catch { toast('Patient saved. Draft cleanup could not finish; keep this device and retry cleanup.', { tone: 'error' }); }
        navigate('/patients/profile', { state: { patientId: patient.patientId }, replace: true });
      } catch (cause) {
        toast(cause instanceof Error ? cause.message : 'Could not save the patient — please try again', {
          tone: 'error',
        });
      } finally { saving.current = false; }
    },
    [context, navigate, toast, clearDraft],
  );
};
