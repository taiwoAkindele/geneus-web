import { CLOSING_STEPS, type AuthorizationContext, type Encounter, type EncounterEntry, type EncounterStep } from '@shared';
import { allOfType, allWhere, envelope, insertRecord, insertRecords, newId, nowIso, type NewRecord } from '../db';
import { newAppointment, type AppointmentDraft } from './appointments';

/**
 * Encounters (PRD §9.8, SCHEMA.md §13): a header and add-only entries, one per
 * saved step. Nothing here updates a row — a correction is an amendment, and
 * closing is saving a closing step.
 */

export const listEncounters = () => allOfType<Encounter>('encounter');

export const encountersForPatient = (patientId: string) => allWhere<Encounter>('encounter', 'patientId', patientId);

export const entriesForEncounter = (encounterId: string) =>
  allWhere<EncounterEntry>('encounter_entry', 'encounterId', encounterId);

/** Every closing entry on the device — what tells an open encounter from a finished one. */
export const closingEntries = async (): Promise<EncounterEntry[]> =>
  (await Promise.all(CLOSING_STEPS.map((step) => allWhere<EncounterEntry>('encounter_entry', 'step', step)))).flat();

export type RecordedStep = Exclude<EncounterStep, 'amendment'>;

export type StepSave = {
  /** Absent when this save opens the encounter (PRD §9.8.1, step 2). */
  encounterId?: string;
  patientId: string;
  step: RecordedStep;
  values: Record<string, unknown>;
  /** A follow-up review to book in the same save (PRD §9.8.1, step 7). */
  followUp?: Omit<AppointmentDraft, 'patientId'>;
};

/**
 * Saves one step, locked. The first save also writes the encounter, and a
 * follow-up books its appointment — all checked before any is written, so a
 * refused save leaves no half-opened encounter or stray booking behind.
 */
export const saveStep = async (save: StepSave, context: AuthorizationContext): Promise<EncounterEntry> => {
  const savedOn = nowIso();
  const records: NewRecord[] = [];

  const encounterId = save.encounterId ?? newId('encounter');
  if (!save.encounterId) {
    records.push({
      permission: 'encounter:record',
      type: 'encounter',
      record: { ...envelope(context, savedOn), id: encounterId, type: 'encounter', patientId: save.patientId, openedOn: savedOn },
    });
  }

  let values = save.values;
  if (save.followUp) {
    const appointment = newAppointment({ ...save.followUp, patientId: save.patientId }, context, savedOn);
    records.push({ permission: 'appointment:create', type: 'appointment', record: appointment });
    values = { ...values, appointmentId: appointment.id };
  }

  const entry = {
    ...envelope(context, savedOn),
    id: newId('encounter_entry'),
    type: 'encounter_entry',
    encounterId,
    patientId: save.patientId,
    step: save.step,
    actorRole: context.role,
    values,
  };
  records.push({ permission: 'encounter:record', type: 'encounter_entry', record: entry });

  const written = await insertRecords(context, records);
  return written[written.length - 1] as EncounterEntry;
};

/** Adds a correction beside a saved entry; the original is never touched (PRD §9.8.3). */
export const amendEntry = (entry: EncounterEntry, note: string, context: AuthorizationContext) =>
  insertRecord<EncounterEntry>(context, 'encounter:record', 'encounter_entry', {
    ...envelope(context),
    id: newId('encounter_entry'),
    type: 'encounter_entry',
    encounterId: entry.encounterId,
    patientId: entry.patientId,
    step: 'amendment',
    actorRole: context.role,
    amends: entry.id,
    values: { note },
  });
