import { currentPatientContact, emailAddress, type AuthorizationContext, type PatientContact } from '@shared';
import { allWhere, envelope, insertRecord, newId, type NewRecord } from '../db';
import { TABLE_FOR } from '../tables';

/**
 * Where a patient receives bills and receipts. Staff record only the email; the patient stops or restarts
 * channels themselves (from their messages and document pages), so a staff change keeps whatever the patient chose.
 */
export const contactsForPatient = (patientId: string) => allWhere<PatientContact>('patient_contact', 'patientId', patientId);
export const currentContact = async (patientId: string) => currentPatientContact(await contactsForPatient(patientId), patientId);

/** The email as typed, tidied; undefined when blank. Throws a readable error when it isn't an email address. */
export const tidyEmail = (typed: string): string | undefined => {
  if (!typed.trim()) return undefined;
  const parsed = emailAddress.safeParse(typed);
  if (!parsed.success || parsed.data.length > 200) throw new Error('Enter a valid email address, or leave it blank');
  return parsed.data;
};

const contactRecord = (patientId: string, email: string | undefined, previous: PatientContact | undefined, context: AuthorizationContext): PatientContact => ({
  ...envelope(context), id: newId('patient_contact'), type: 'patient_contact', patientId, email,
  smsStopped: previous?.smsStopped ?? false, emailStopped: previous?.emailStopped ?? false, source: 'staff',
  ...(previous ? { replaces: previous.id } : {}),
} as PatientContact);

/** For a new patient: saved in the same write as the registration. */
export const newPatientContact = (patientId: string, email: string, context: AuthorizationContext): NewRecord =>
  ({ permission: 'patient:update', type: 'patient_contact', record: contactRecord(patientId, email, undefined, context) });

/** Records a changed email for a registered patient. Does nothing when the email is unchanged. */
export const saveContactEmail = async (patientId: string, email: string | undefined, context: AuthorizationContext): Promise<boolean> => {
  const previous = await currentContact(patientId);
  if ((previous?.email ?? undefined) === email) return false;
  await insertRecord<PatientContact>(context, 'patient:update', 'patient_contact', contactRecord(patientId, email, previous, context), {
    // Another change saved on this device meanwhile: stop rather than fork the patient's contact history.
    checkUnderLock: async (tx) => {
      const later = previous
        ? await tx.getOptional(`SELECT id FROM ${TABLE_FOR.patient_contact} WHERE replaces = ?`, [previous.id])
        : await tx.getOptional(`SELECT id FROM ${TABLE_FOR.patient_contact} WHERE "patientId" = ?`, [patientId]);
      if (later) throw new Error("This patient's email was changed meanwhile. Close and review it before saving.");
    },
  });
  return true;
};

/** What staff should know about the patient's own choices, e.g. "SMS stopped by the patient". */
export const stoppedChannelsNote = (contact: PatientContact | undefined): string | undefined => {
  const stopped = [contact?.smsStopped ? 'SMS' : '', contact?.emailStopped ? 'email' : ''].filter(Boolean);
  return stopped.length ? `The patient stopped bills and receipts by ${stopped.join(' and ')}. Only the patient can start them again.` : undefined;
};
