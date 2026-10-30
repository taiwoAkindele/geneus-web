import { closesEncounter, effectiveEncounterEntries, careEntryIssues, currentAllergies, currentClinicalEvents, type ClinicalEvent, POST_CONSULTATION_STEPS, type Referral, type Patient, type FeeItem, type InvestigationItem, ENCOUNTER_STEP_VALUES, REPEATABLE_STEPS, type AuthorizationContext, type Encounter, type EncounterEntry, type EncounterStep } from '@shared';
import { allOfType, allWhere, findRecord, envelope, insertRecord, insertRecords, newId, nowIso, type NewRecord } from '../db';
import { bookingRecords, listAppointments, type AppointmentDraft } from './appointments';
import { adjustmentsForPatient, chargesForPatient, isAppointmentConfirmed, paymentsForPatient, newCharge, patientBillingFacts } from './billing';
import { patientIdentityIds } from './patientIdentity';

/**
 * Encounters (PRD §9.8, SCHEMA.md §13): a header and add-only entries, one per
 * saved step. Nothing here updates a row — a correction is an amendment, and
 * closing is saving a closing step.
 */

export const listEncounters = () => allOfType<Encounter>('encounter');
export const listEncounterEntries = () => allOfType<EncounterEntry>('encounter_entry');

export const encountersForPatient = (patientId: string) => allWhere<Encounter>('encounter', 'patientId', patientId);

export const entriesForEncounter = (encounterId: string) =>
  allWhere<EncounterEntry>('encounter_entry', 'encounterId', encounterId);

/** Every saved entry at these steps, across encounters — what the station queues are read from. */
export const entriesAtSteps = async (steps: readonly EncounterStep[]): Promise<EncounterEntry[]> =>
  (await Promise.all(steps.map((step) => allWhere<EncounterEntry>('encounter_entry', 'step', step)))).flat();

/** Every closing entry on the device — what tells an open encounter from a finished one. */
export const closingEntries = async (): Promise<EncounterEntry[]> =>
  (await listEncounterEntries()).filter(closesEncounter);

export type RecordedStep = Exclude<EncounterStep, 'amendment'>;

export type StepSave = {
  /** Absent when this save opens the encounter (PRD §9.8.1, step 2). */
  encounterId?: string;
  appointmentId?: string;
  patientId: string;
  step: RecordedStep;
  values: Record<string, unknown>;
  /** A follow-up review to book in the same save (PRD §9.8.1, step 7). */
  followUp?: Omit<AppointmentDraft, 'patientId'>;
  collectLaterReason?: string;
  investigationReason?: string;
  workflowVersion?: 1;
};

/**
 * Saves one step, locked. The first save also writes the encounter, and a
 * follow-up books its appointment — all checked before any is written, so a
 * refused save leaves no half-opened encounter or stray booking behind.
 */
export const saveStep = async (save: StepSave, context: AuthorizationContext): Promise<EncounterEntry> => {
  if (save.encounterId) {
    const prior = await entriesForEncounter(save.encounterId);
    if (prior.some(closesEncounter) && !(POST_CONSULTATION_STEPS as readonly string[]).includes(save.step)) throw new Error('This encounter is closed. Add an amendment instead');
    if (!(REPEATABLE_STEPS as readonly string[]).includes(save.step) && prior.some((entry) => entry.step === save.step)) throw new Error('This section is already saved. Add an amendment instead');
  }
  const savedOn = nowIso();
  const records: NewRecord[] = [];

  const encounterId = save.encounterId ?? newId('encounter');
  if (!save.encounterId) {
    const ids = await patientIdentityIds(save.patientId);
    const [chargeGroups, paymentGroups, adjustmentGroups, appointments] = await Promise.all([Promise.all(ids.map(chargesForPatient)), Promise.all(ids.map(paymentsForPatient)), Promise.all(ids.map(adjustmentsForPatient)), listAppointments()]);
    const charges = chargeGroups.flat(), payments = paymentGroups.flat(), adjustments = adjustmentGroups.flat();
    const appointment = appointments.find((a) => a.id === save.appointmentId);
    if (save.appointmentId) {
      if (!appointment || appointment.patientId !== save.patientId) throw new Error('This booking is not available for this patient');
      if (appointment.attendance === 'cancelled' || appointment.attendance === 'no_show') throw new Error('Reopen this inactive booking before starting care');
      if ((await listEncounters()).some((encounter) => encounter.appointmentId === appointment.id)) throw new Error('This booking already has a visit. Continue or review that visit');
    }
    const unpaid = save.appointmentId ? !isAppointmentConfirmed(save.appointmentId, charges, payments, adjustments, appointment?.chargeIds) : false;
    if (unpaid && !save.collectLaterReason?.trim()) throw new Error('Give a See now — collect later reason to continue care');
    records.push({
      permission: 'encounter:record',
      type: 'encounter',
      record: { ...envelope(context, savedOn), id: encounterId, type: 'encounter', workflowVersion: save.workflowVersion, patientId: save.patientId, appointmentId: save.appointmentId, openedOn: savedOn, collectLaterReason: unpaid ? save.collectLaterReason?.trim() : undefined },
    });
  }

  let values = { ...save.values };
  const prior = save.encounterId ? effectiveEncounterEntries(await entriesForEncounter(save.encounterId)) : [];
  if (save.step === 'disposition') {
    if (values.kind === 'referral') {
      const patient = await findRecord<Patient>('patient', save.patientId);
      if (!patient) throw new Error('The referring patient is unavailable');
      if (!values.toFacilityId || values.toFacilityId === context.facilityId) throw new Error('Choose a different receiving facility');
      const events = await allWhere<ClinicalEvent>('clinical_event', 'patientId', save.patientId);
      const allergies = currentAllergies(events, [patient]).map((a) => [a.allergen, a.reaction].filter(Boolean).join(': '));
      const medications = currentClinicalEvents(events).filter((e) => e.kind === 'medication' && e.values.status === 'active').map((e) => [e.values.drug, e.values.dose, e.values.frequency].filter(Boolean).join(' '));
      const referralId = newId('referral');
      const referral: Referral = { ...envelope(context, savedOn), id: referralId, type: 'referral', referralId, patientId: save.patientId, fromFacilityId: context.facilityId, toFacilityId: String(values.toFacilityId), tier1: { fullName: patient.fullName, sex: patient.sex, ageYears: patient.ageYears, dateOfBirth: patient.dateOfBirth, allergies, currentMedications: medications, reason: String(values.note) }, status: 'sent', deliveryStatus: 'alert_pending', sentOn: savedOn, notYetArrivedFlagged: false };
      records.push({ permission: 'referral:create', type: 'referral', record: referral });
      values.referralId = referralId;
    }
  }
  const issues = careEntryIssues({ step: save.step, values, workflowVersion: save.workflowVersion }, prior);
  if (issues.length) throw new Error(issues.join('. '));
  if (save.followUp) {
    const followUp = await bookingRecords({ ...save.followUp, patientId: save.patientId, visitType: 'follow_up' }, context, savedOn);
    records.push(...followUp);
    const appointment = followUp[0].record as { id: string };
    values = { ...values, appointmentId: appointment.id };
  }

  const entry = {
    ...envelope(context, savedOn),
    id: newId('encounter_entry'),
    type: 'encounter_entry',
    workflowVersion: save.workflowVersion,
    encounterId,
    patientId: save.patientId,
    step: save.step,
    actorRole: context.role,
    values,
  };
  records.push({ permission: 'encounter:record', type: 'encounter_entry', record: entry });
  if (save.step === 'lab_order' && Array.isArray(values.items)) {
    const patient = await findRecord<Patient>('patient', save.patientId);
    if (!patient) throw new Error('The patient is not available');
    for (const item of values.items as InvestigationItem[]) {
      if (!item.feeItemId) continue;
      const fee = await findRecord<FeeItem>('fee_item', item.feeItemId);
      if (!fee || fee.facilityId !== context.facilityId || !fee.active) throw new Error('An investigation fee is unavailable. Review the catalogue');
      const snapshot = { ...fee, amountMinor: item.priceMinor!, currency: item.currency! };
      const charge = { ...newCharge(snapshot, { patientId: patient.id, encounterId, facts: patientBillingFacts(patient) }, context), id: 'charge:order:' + item.id, orderItemId: item.id, orderEntryId: entry.id };
      records.push({ permission: 'charge:create', type: 'charge', record: charge });
    }
    records.push({ permission: 'encounter:record', type: 'encounter_entry', record: { ...envelope(context, savedOn), id: newId('encounter_entry'), type: 'encounter_entry', workflowVersion: 1, encounterId, patientId: save.patientId, step: 'investigation_review', actorRole: context.role, values: { decision: 'ordered', orderEntryId: entry.id, reason: save.investigationReason?.trim() || undefined } } });
  }


  const written = await insertRecords(context, records);
  return written.find((r) => r.type === 'encounter_entry' && r.step === save.step) as EncounterEntry;
};

/** Adds a correction beside a saved entry; the original is never touched (PRD §9.8.3). */
export const amendEntry = async (entry: EncounterEntry, note: string, context: AuthorizationContext, correctedValues?: Record<string, unknown>, expectedCorrectionId?: string | null) => {
  let previousAmendmentId: string | undefined;
  if (correctedValues) {
    if (!['vitals', 'complaint', 'lab_results', 'diagnosis', 'prescription', 'injection_order', 'injection'].includes(entry.step)) throw new Error('This section supports explanatory amendments only');
    ENCOUNTER_STEP_VALUES[entry.step].parse(correctedValues);
    const entries = await entriesForEncounter(entry.encounterId);
    const corrections = entries.filter((e) => e.step === 'amendment' && e.amends === entry.id && e.values.correctedValues);
    const replaced = new Set(corrections.map((e) => e.values.previousAmendmentId));
    const latest = corrections.find((e) => !replaced.has(e.id));
    previousAmendmentId = latest?.id;
    if (expectedCorrectionId !== undefined && expectedCorrectionId !== (previousAmendmentId ?? null)) throw new Error('This entry was corrected while you were editing. Reopen it to review the correction');
    if (entry.step === 'prescription' && entries.some((e) => e.step === 'dispense')) throw new Error('Medication has been dispensed. Record changes through medication reconciliation');
    if (entry.step === 'injection_order' && entries.some((e) => e.step === 'injection')) throw new Error('This injection has been administered. Record a new clinical treatment decision');
    if (entry.step === 'lab_results' && entry.workflowVersion === 1) {
      const before = ENCOUNTER_STEP_VALUES.lab_results.parse(entry.values).results.map((r) => r.orderItemId ?? r.test).sort();
      const after = ENCOUNTER_STEP_VALUES.lab_results.parse(correctedValues).results.map((r) => r.orderItemId ?? r.test).sort();
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('A result correction cannot change its ordered investigation identity');
    }
    if (entry.step === 'diagnosis') {
      const original = ENCOUNTER_STEP_VALUES.diagnosis.parse(entry.values);
      const current = ENCOUNTER_STEP_VALUES.diagnosis.parse(latest?.values.correctedValues ?? entry.values);
      const corrected = ENCOUNTER_STEP_VALUES.diagnosis.parse(correctedValues);
      if (corrected.admit !== original.admit || corrected.giveInjection !== original.giveInjection) throw new Error('Correcting a diagnosis cannot change the saved disposition');
      if (entries.some((e) => e.step === 'dispense') && JSON.stringify(corrected.prescription) !== JSON.stringify(current.prescription)) {
        throw new Error('Medication has been dispensed. Record the medication change in the longitudinal medication list');
      }
    }
  }
  return insertRecord<EncounterEntry>(context, 'encounter:record', 'encounter_entry', {
    ...envelope(context),
    id: newId('encounter_entry'),
    type: 'encounter_entry',
    workflowVersion: entry.workflowVersion,
    encounterId: entry.encounterId,
    patientId: entry.patientId,
    step: 'amendment',
    actorRole: context.role,
    amends: entry.id,
    values: { note, ...(correctedValues ? { correctedValues, ...(previousAmendmentId ? { previousAmendmentId } : {}) } : {}) },
  });
};
