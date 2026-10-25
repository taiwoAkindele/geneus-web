import { Patient, patientAge, type AuthorizationContext } from '@shared';
import { mintPatientId } from '@/lib/patientId';
import { allOfType, envelope, findRecord, insertRecord, insertRecords, updateRecord, type NewRecord } from '../db';
import { listFeeItems, newCharge, patientBillingFacts } from './billing';

export const listPatients = () => allOfType<Patient>('patient');

/** A patient record's `id` is its patientId (SCHEMA.md §4). */
export const getPatient = (patientId: string) => findRecord<Patient>('patient', patientId);

/** What the front desk records about a patient (PRD §10 — NASADOR, plus phone and the paper folder). */
export type PatientDetails = Pick<
  Patient,
  'fullName' | 'address' | 'sex' | 'ageYears' | 'dateOfBirth' | 'phone' | 'occupation' | 'religion' | 'legacyPaperRef'
> & Partial<Pick<Patient, 'dobEstimated' | 'ageObservedOn' | 'nin' | 'identityEvidence' | 'identityEvidenceNote'>>;

/**
 * Registers a new patient under a Patient ID minted here, offline. The
 * facility's code is its id — the server holds the two equal (SCHEMA.md §4).
 */
export const registerPatient = async (details: PatientDetails, context: AuthorizationContext, extraRecords?: (patientId: string) => NewRecord[]): Promise<Patient> => {
  const existing = await listPatients();
  const patientId = mintPatientId(
    context.facilityId,
    existing.map((patient) => patient.patientId),
  );
  const patient = Patient.parse({
    ...envelope(context),
    ...details,
    id: patientId,
    type: 'patient',
    patientId,
    allergies: [],
  });
  // Visit-dependent policy cannot be decided until booking supplies the visit type.
  const fees = (await listFeeItems()).filter((fee) => fee.active && fee.chargeWhen === 'first_visit' && !fee.exemptions.some((rule) => rule.visitTypes));
  await insertRecords(context, [{ permission: 'patient:create', type: 'patient', record: patient }, ...fees.map((fee) => ({
    permission: 'charge:create' as const, type: 'charge' as const, record: newCharge(fee, { patientId, facts: patientBillingFacts(patient) }, context),
  })), ...(extraRecords?.(patientId) ?? [])]);
  return patient;
};

/**
 * Saves only the fields that changed, so another device's edit to a different
 * field merges cleanly on the server and the same field raises a conflict
 * rather than being overwritten (SCHEMA.md §7). Explicit null patches clear
 * optional values; the shared contract normalises those back to absence.
 */
export const updatePatient = async (
  patientId: string,
  details: PatientDetails,
  context: AuthorizationContext,
): Promise<Patient> => {
  const current = await findRecord<Patient>('patient', patientId);
  if (!current) throw new Error(`no patient ${patientId} to change`);
  const next: Record<string, unknown> = { ...details };
  if (details.ageYears === patientAge(current) && details.dateOfBirth === current.dateOfBirth) {
    next.ageYears = current.ageYears;
    next.ageObservedOn = current.ageObservedOn;
  }
  const changes = Object.fromEntries(
    Object.entries(next).filter(([field, value]) => value !== current[field as keyof Patient])
      .map(([field, value]) => [field, value === undefined ? null : value]),
  ) as Partial<Patient>;
  if (Object.keys(changes).length === 0) return current;
  return updateRecord<Patient>(context, 'patient:update', 'patient', patientId, changes);
};

export const findPatient = (patients: Patient[], patientId: string): Patient | undefined =>
  patients.find((patient) => patient.patientId === patientId);

export type PatientSeed = {
  patientId: string;
  fullName: string;
  address: string;
  sex: Patient['sex'];
  ageYears: number;
  phone?: string;
  allergies: string[];
  createdOn: string;
};

/** A patient record's `id` is its patientId (SCHEMA.md §4). */
export const seedPatient = (patient: PatientSeed, context: AuthorizationContext) =>
  insertRecord<Patient>(context, 'patient:create', 'patient', {
    ...envelope(context, patient.createdOn),
    id: patient.patientId,
    type: 'patient',
    patientId: patient.patientId,
    fullName: patient.fullName,
    address: patient.address,
    sex: patient.sex,
    ageYears: patient.ageYears,
    phone: patient.phone,
    allergies: patient.allergies,
  });
