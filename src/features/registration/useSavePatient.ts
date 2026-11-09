import { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Charge } from '@shared';
import { registerPatient, updatePatient } from '@/data/repos/patients';
import { newPatientBookingRecords } from '@/data/repos/appointments';
import type { NewRecord } from '@/data/db';
import { useAuthorizationContext } from '@/session';
import { useToast } from '@/ui';
import { useClearRegistrationDraft } from './RegistrationDraftProvider';
import { toPatientDetails, type RegistrationValues } from './registrationValues';
import { amountsDue, type RegistrationVisit } from './visitFees';
import { identityReviewRecords, type RegistrationDecision } from '@/data/repos/patientIdentity';

/** Where a newly registered and booked patient goes next, shown on their record. */
export type RegistrationOutcome = { patientId: string; message: string };

const outcomeOf = (patientId: string, booked: boolean, charges: readonly Charge[]): string => {
  if (!booked) return `Registered — ${patientId}`;
  const due = amountsDue(charges);
  if (due.length) return `Registered — ${patientId}. Booked for now · ${due.join(' + ')} to pay at the cashier.`;
  return `Registered — ${patientId}. Booked for now · nothing to pay, ready for the nurse station.`;
};

/**
 * Saves the registration form — a new patient, or the one being edited — then
 * opens their profile. Shared by the form and the duplicate check, which both
 * end in the same save. A visit chosen on the form is booked in the same write,
 * so the patient is never registered without the booking the desk asked for.
 */
export const useSavePatient = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const context = useAuthorizationContext();
  const clearDraft = useClearRegistrationDraft();
  const saving = useRef(false);

  return useCallback(
    async (values: RegistrationValues, editingPatientId?: string, decision?: RegistrationDecision, visit?: RegistrationVisit) => {
      if (saving.current) return;
      saving.current = true;
      try {
        const details = toPatientDetails(values);
        const charges: Charge[] = [];
        const booked = Boolean(visit) && !editingPatientId;
        const patient = editingPatientId
          ? await updatePatient(editingPatientId, details, context)
          : await registerPatient(details, context, (patientId, created) => {
            const extra: NewRecord[] = [...identityReviewRecords(patientId, decision, context)];
            charges.push(...created.charges);
            if (visit) {
              const booking = newPatientBookingRecords({ patientId, reason: visit.reason, visitType: visit.visitType }, context, created);
              charges.push(...booking.filter((record) => record.type === 'charge').map((record) => record.record as Charge));
              extra.push(...booking);
            }
            return extra;
          });
        const message = editingPatientId ? 'Patient details saved' : outcomeOf(patient.patientId, booked, charges);
        toast(message);
        try { await clearDraft(editingPatientId ?? 'new'); }
        catch { toast('Patient saved. Draft cleanup could not finish; keep this device and retry cleanup.', { tone: 'error' }); }
        const outcome: RegistrationOutcome | undefined = editingPatientId ? undefined : { patientId: patient.patientId, message };
        navigate('/patients/profile', { state: { patientId: patient.patientId, outcome }, replace: true });
      } catch (cause) {
        toast(cause instanceof Error ? cause.message : 'Could not save the patient — please try again', {
          tone: 'error',
        });
      } finally { saving.current = false; }
    },
    [context, navigate, toast, clearDraft],
  );
};
