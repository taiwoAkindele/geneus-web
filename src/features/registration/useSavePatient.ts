import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthorizationError } from '@/data';
import { registerPatient, updatePatient } from '@/data/repos/patients';
import { useAuthorizationContext } from '@/session';
import { useToast } from '@/ui';
import { toPatientDetails, type RegistrationValues } from './registrationValues';

/**
 * Saves the registration form — a new patient, or the one being edited — then
 * opens their profile. Shared by the form and the duplicate check, which both
 * end in the same save.
 */
export const useSavePatient = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const context = useAuthorizationContext();

  return useCallback(
    async (values: RegistrationValues, editingPatientId?: string) => {
      const details = toPatientDetails(values);
      try {
        const patient = editingPatientId
          ? await updatePatient(editingPatientId, details, context)
          : await registerPatient(details, context);
        toast(editingPatientId ? 'Patient details saved' : `Registered — ${patient.patientId}`);
        navigate('/patients/profile', { state: { patientId: patient.patientId }, replace: true });
      } catch (cause) {
        toast(cause instanceof AuthorizationError ? cause.message : 'Could not save the patient — please try again', {
          tone: 'error',
        });
      }
    },
    [context, navigate, toast],
  );
};
