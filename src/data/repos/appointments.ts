import { Appointment, type AuthorizationContext, type Patient, type VisitType } from '@shared';
import { assertAllowed } from '@/auth/authorization';
import { allOfType, ContractError, envelope, findRecord, insertRecords, newId, type NewRecord } from '../db';
import { chargesForPatient, listFeeItems, newCharge, patientBillingFacts } from './billing';
import { patientIdentityIds } from './patientIdentity';

export const listAppointments = () => allOfType<Appointment>('appointment');

export type AppointmentDraft = {
  patientId: string;
  reason: string;
  /** Absent books the patient for now; present schedules them ahead. */
  scheduledFor?: string;
  visitType?: VisitType;
};

/** The appointment record for a booking — also written alongside a follow-up that closes an encounter. */
export const newAppointment = (draft: AppointmentDraft, context: AuthorizationContext, createdOn?: string) => ({
  ...envelope(context, createdOn),
  id: newId('appointment'),
  type: 'appointment' as const,
  patientId: draft.patientId,
  reason: draft.reason,
  scheduledFor: draft.scheduledFor,
  visitType: draft.visitType,
  status: draft.scheduledFor ? ('scheduled' as const) : ('pending' as const),
});

export const bookingRecords = async (draft: AppointmentDraft, context: AuthorizationContext, createdOn?: string): Promise<NewRecord[]> => {
  assertAllowed(context, 'appointment:create');
  const appointment = newAppointment(draft, context, createdOn);
  const parsed = Appointment.safeParse(appointment);
  if (!parsed.success) throw new ContractError(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  const [patient, fees, appointments] = await Promise.all([findRecord<Patient>('patient', draft.patientId), listFeeItems(), listAppointments()]);
  if (!patient) throw new Error('The patient is not available on this device');
  const identityIds = await patientIdentityIds(draft.patientId);
  const linkedCharges = (await Promise.all(identityIds.map(chargesForPatient))).flat();
  const firstVisit = !appointments.some((a) => identityIds.includes(a.patientId));
  const selected = fees.filter((f) => f.active && (f.chargeWhen === 'every_visit' || (firstVisit && f.chargeWhen === 'first_visit' && !linkedCharges.some((c) => c.feeItemId === f.id))));
  const raised = selected.map((fee): NewRecord => ({
    permission: 'charge:create', type: 'charge', record: newCharge(fee, { patientId: draft.patientId, appointmentId: appointment.id, facts: patientBillingFacts(patient, draft.visitType) }, context),
  }));
  const firstVisitIds = firstVisit ? linkedCharges.filter((c) => fees.some((f) => f.id === c.feeItemId && f.chargeWhen === 'first_visit')).map((c) => c.id) : [];
  return [{ permission: 'appointment:create', type: 'appointment', record: { ...appointment, chargeIds: [...firstVisitIds, ...raised.map((r) => (r.record as { id: string }).id)] } }, ...raised];
};
export const book = async (draft: AppointmentDraft, context: AuthorizationContext, createdOn?: string): Promise<Appointment> =>
  (await insertRecords(context, await bookingRecords(draft, context, createdOn)))[0] as Appointment;
