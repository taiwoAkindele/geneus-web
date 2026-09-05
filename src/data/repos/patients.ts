import { Patient } from '@shared';
import { allOfType, envelope, put, type WriteContext } from '../db';

export const listPatients = () => allOfType<Patient>('patient');

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

/** A patient document's `_id` is its patientId (SCHEMA.md §4). */
export const seedPatient = (patient: PatientSeed, context: WriteContext) =>
  put(
    Patient.parse({
      ...envelope(context, patient.createdOn),
      _id: patient.patientId,
      type: 'patient',
      patientId: patient.patientId,
      fullName: patient.fullName,
      address: patient.address,
      sex: patient.sex,
      ageYears: patient.ageYears,
      phone: patient.phone,
      allergies: patient.allergies,
    }),
  );
