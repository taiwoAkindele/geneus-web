import type { AuthorizationContext, Patient } from '@shared';
import { mintPatientId } from '@/lib/patientId';
import { allOfType, envelope, findRecord, insertRecord, updateRecord } from '../db';

export const listPatients = () => allOfType<Patient>('patient');

/** A patient record's `id` is its patientId (SCHEMA.md §4). */
export const getPatient = (patientId: string) => findRecord<Patient>('patient', patientId);

/** What the front desk records about a patient (PRD §10 — NASADOR, plus phone and the paper folder). */
export type PatientDetails = Pick<
  Patient,
  'fullName' | 'address' | 'sex' | 'ageYears' | 'dateOfBirth' | 'phone' | 'occupation' | 'religion' | 'legacyPaperRef'
>;

/**
 * Registers a new patient under a Patient ID minted here, offline. The
 * facility's code is its id — the server holds the two equal (SCHEMA.md §4).
 */
export const registerPatient = async (details: PatientDetails, context: AuthorizationContext): Promise<Patient> => {
  const existing = await listPatients();
  const patientId = mintPatientId(
    context.facilityId,
    existing.map((patient) => patient.patientId),
  );
  return insertRecord<Patient>(context, 'patient:create', 'patient', {
    ...envelope(context),
    ...details,
    id: patientId,
    type: 'patient',
    patientId,
  });
};

/**
 * Saves only the fields that changed, so another device's edit to a different
 * field merges cleanly on the server and the same field raises a conflict
 * rather than being overwritten (SCHEMA.md §7). A cleared optional field is
 * left as it was: the contract records absence, and a patch cannot express it.
 */
export const updatePatient = async (
  patientId: string,
  details: PatientDetails,
  context: AuthorizationContext,
): Promise<Patient> => {
  const current = await findRecord<Patient>('patient', patientId);
  if (!current) throw new Error(`no patient ${patientId} to change`);
  const changes = Object.fromEntries(
    Object.entries(details).filter(
      ([field, value]) => value !== undefined && value !== current[field as keyof Patient],
    ),
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
