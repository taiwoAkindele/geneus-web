import {
  chargeUnits, coversOn, estimateCoverage, indexCoverageRecords, scheduleOn, selfPayPermitted, serviceDateOf,
  type AuthorizationContext, type Charge, type CoverageAllocation, type CoverageElection, type CoverageEstimate, type CoverageRecords,
  type CoverCheck, type CoverSchedule, type EncounterEntry, type Facility, type Payer, type PatientCover, type Refund,
} from '@shared';
import { allOfType, allWhere, envelope, findRecord, insertRecord, newId } from '../db';

/** The records the shared estimate reads. With insurance off they are all empty and every charge is cash. */
export type CoverageData = CoverageRecords & { payers: Payer[]; refunds: Refund[]; timeZone?: string; entries: Map<string, EncounterEntry> };

export const listPayers = () => allOfType<Payer>('payer');
export const listRefunds = () => allOfType<Refund>('refund');
export const coversForPatient = (patientId: string) => allWhere<PatientCover>('patient_cover', 'patientId', patientId);
export const checksForPatient = (patientId: string) => allWhere<CoverCheck>('cover_check', 'patientId', patientId);

export const loadCoverage = async (charges: readonly Charge[] = []): Promise<CoverageData> => {
  const [covers, checks, elections, allocations, schedules, payers, refunds, facilities] = await Promise.all([
    allOfType<PatientCover>('patient_cover'), allOfType<CoverCheck>('cover_check'), allOfType<CoverageElection>('coverage_election'),
    allOfType<CoverageAllocation>('coverage_allocation'), allOfType<CoverSchedule>('cover_schedule'), listPayers(), listRefunds(), allOfType<Facility>('facility'),
  ]);
  const entries = new Map<string, EncounterEntry>();
  // Only insured patients' medicine charges need their quantity; cash patients never look it up.
  const insured = new Set(covers.map((c) => c.patientId));
  for (const id of new Set(charges.filter((c) => c.dispenseEntryId && insured.has(c.patientId)).map((c) => c.dispenseEntryId!))) {
    const entry = await findRecord<EncounterEntry>('encounter_entry', id);
    if (entry) entries.set(id, entry);
  }
  return { covers, checks, elections, allocations, schedules, payers, refunds, entries, timeZone: facilities[0]?.timeZone };
};

/** The same estimate the server makes, from the records this device holds. */
export const estimateCharge = (charge: Charge, data: CoverageData): CoverageEstimate => estimateCoverage({
  charge, records: data, serviceDate: serviceDateOf(charge.createdOn, data.timeZone),
  units: chargeUnits(charge, charge.dispenseEntryId ? data.entries.get(charge.dispenseEntryId) : undefined),
});
export const estimatesFor = (charges: readonly Charge[], data: CoverageData): Map<string, CoverageEstimate> => {
  const forPatient = indexCoverageRecords(data);
  return new Map(charges.map((charge) => [charge.id, estimateCharge(charge, { ...data, ...forPatient(charge.patientId) })]));
};

/** Newest synced schedule time: shown beside every estimate as the age of the data it used. */
export const coverageDataAge = (data: Pick<CoverageData, 'schedules'>): string | undefined =>
  data.schedules.map((s) => s.updatedOn ?? s.createdOn).sort().slice(-1)[0];

/** The patient's current covers: nothing replaced them. */
export const currentCovers = (patientId: string, covers: readonly PatientCover[]) => {
  const mine = covers.filter((c) => c.patientId === patientId);
  const replaced = new Set(mine.map((c) => c.replaces).filter(Boolean));
  return mine.filter((c) => !replaced.has(c.id));
};

/** Whether an active cover of this patient lacks a check covering today: the check-in prompt. */
export const coverNeedsCheck = (patientId: string, data: Pick<CoverageData, 'covers' | 'checks' | 'timeZone'>, now = new Date().toISOString()): PatientCover | undefined => {
  const today = serviceDateOf(now, data.timeZone);
  if (!today) return undefined;
  return coversOn(patientId, today, data.covers).find((cover) => !data.checks.some((c) => c.coverId === cover.id && c.coversFrom <= today && today <= c.coversTo));
};

export type CoverDraft = Pick<PatientCover, 'patientId' | 'payerId' | 'planCode' | 'enrolleeNumber' | 'relationship' | 'principalName' | 'validFrom' | 'validTo' | 'active'> & { replaces?: string };
export const recordCover = (draft: CoverDraft, context: AuthorizationContext) => insertRecord<PatientCover>(context, 'cover:record', 'patient_cover', {
  ...envelope(context), id: newId('patient_cover'), type: 'patient_cover', ...draft,
  enrolleeNumber: draft.enrolleeNumber.trim(), principalName: draft.principalName?.trim() || undefined,
  validFrom: draft.validFrom || undefined, validTo: draft.validTo || undefined, replaces: draft.replaces || undefined,
});

export type CheckDraft = Pick<CoverCheck, 'patientId' | 'coverId' | 'method' | 'result' | 'coversFrom' | 'coversTo' | 'reference' | 'note'>;
export const recordCheck = (draft: CheckDraft, context: AuthorizationContext) => insertRecord<CoverCheck>(context, 'cover:verify', 'cover_check', {
  ...envelope(context), id: newId('cover_check'), type: 'cover_check', ...draft,
  reference: draft.reference?.trim() || undefined, note: draft.note?.trim() || undefined,
});

export const chooseCover = (patientId: string, coverId: string, chargeIds: readonly string[], context: AuthorizationContext) =>
  insertRecord<CoverageElection>(context, 'cover:record', 'coverage_election', {
    ...envelope(context), id: newId('coverage_election'), type: 'coverage_election', patientId, kind: 'use_cover', coverId, chargeIds: [...chargeIds],
  });

/**
 * Whether the till may offer "Patient chooses to pay without insurance" for a
 * charge: only where the contract version in force on its date of service
 * allows it. A not-eligible check is the other route, with its check named.
 */
export const selfPayOffered = (charge: Charge, cover: PatientCover, data: CoverageData, check?: CoverCheck): boolean => {
  const date = serviceDateOf(charge.createdOn, data.timeZone);
  if (!date) return false;
  const election = { reason: check ? 'not_eligible' : 'patient_choice', coverCheckId: check?.id } as CoverageElection;
  return selfPayPermitted(election, cover, date, data);
};
export const contractRuleOn = (charge: Charge, cover: PatientCover, data: CoverageData) => {
  const date = serviceDateOf(charge.createdOn, data.timeZone);
  return date ? scheduleOn(cover.payerId, cover.planCode, date, data.schedules) : undefined;
};

export const electSelfPay = (input: { patientId: string; coverId: string; chargeIds: readonly string[]; reason: 'patient_choice' | 'not_eligible'; coverCheckId?: string; note?: string }, context: AuthorizationContext) =>
  insertRecord<CoverageElection>(context, 'coverage:elect_self_pay', 'coverage_election', {
    ...envelope(context), id: newId('coverage_election'), type: 'coverage_election', patientId: input.patientId, kind: 'self_pay', coverId: input.coverId,
    chargeIds: [...input.chargeIds], reason: input.reason, coverCheckId: input.coverCheckId, patientAgreed: true, note: input.note?.trim() || undefined,
  });
