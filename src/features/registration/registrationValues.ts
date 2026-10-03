import type { Patient } from '@shared';
import type { PatientDetails } from '@/data/repos/patients';

export type Religion = 'christianity' | 'islam' | 'other';

/**
 * The two registration steps' inputs, exactly as typed — strings, and blanks
 * for anything not asked yet. They travel between the steps in navigation
 * state and become a {@link PatientDetails} only at the save (ENGINEERING.md:
 * normalise at the persistence boundary).
 */
export type RegistrationValues = {
  fullName: string;
  sex: 'F' | 'M';
  age: string;
  dateOfBirth: string;
  phone: string;
  address: string;
  occupation: string;
  religion: Religion | '';
  folder: string;
};

/** Present when the form edits a registered patient rather than registering a new one. */
export type RegistrationNavState = { values?: Partial<RegistrationValues>; patientId?: string } | null;

export const EMPTY_REGISTRATION: RegistrationValues = {
  fullName: '',
  sex: 'F',
  age: '',
  dateOfBirth: '',
  phone: '',
  address: '',
  occupation: '',
  religion: '',
  folder: '',
};

const optional = (value: string): string | undefined => value.trim() || undefined;

/** Whole years, as the contract stores them; blank when not given. */
export const parseAge = (age: string): number | undefined => (age.trim() === '' ? undefined : Number(age));

export const toPatientDetails = (values: RegistrationValues): PatientDetails => ({
  fullName: values.fullName.trim(),
  address: values.address.trim(),
  sex: values.sex === 'F' ? 'female' : 'male',
  ageYears: parseAge(values.age),
  dateOfBirth: optional(values.dateOfBirth),
  phone: optional(values.phone),
  occupation: optional(values.occupation),
  religion: optional(values.religion),
  legacyPaperRef: optional(values.folder),
});

const isReligion = (value: string | undefined): value is Religion =>
  value === 'christianity' || value === 'islam' || value === 'other';

export const fromPatient = (patient: Patient): RegistrationValues => ({
  fullName: patient.fullName,
  sex: patient.sex === 'female' ? 'F' : 'M',
  age: patient.ageYears === undefined ? '' : String(patient.ageYears),
  dateOfBirth: patient.dateOfBirth ?? '',
  phone: patient.phone ?? '',
  address: patient.address,
  occupation: patient.occupation ?? '',
  religion: isReligion(patient.religion) ? patient.religion : '',
  folder: patient.legacyPaperRef ?? '',
});
