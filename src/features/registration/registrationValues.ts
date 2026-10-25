import { patientAge, validCalendarDate, yearsBetween, type Patient } from '@shared';
import type { PatientDetails } from '@/data/repos/patients';

export type Religion = 'christianity' | 'islam' | 'other';

/**
 * The two registration steps' inputs, exactly as typed — strings, and blanks
 * for anything not asked yet. They stay in memory between steps and become
 * a {@link PatientDetails} only at the save (ENGINEERING.md: normalise at
 * the persistence boundary).
 */
export type RegistrationValues = {
  fullName: string;
  sex: '' | 'F' | 'M';
  age: string;
  dateOfBirth: string;
  phone: string;
  address: string;
  occupation: string;
  religion: Religion | '';
  folder: string;
  dobEstimated: boolean;
  nin: string;
  identityEvidence: 'reported' | 'document_seen';
  identityEvidenceNote: string;
};

/** Present when the form edits a registered patient rather than registering a new one. */
export type RegistrationNavState = { patientId?: string } | null;

export const EMPTY_REGISTRATION: RegistrationValues = {
  fullName: '',
  sex: '',
  age: '',
  dateOfBirth: '',
  phone: '',
  address: '',
  occupation: '',
  religion: '',
  folder: '',
  dobEstimated: false,
  nin: '',
  identityEvidence: 'reported',
  identityEvidenceNote: '',
};

const optional = (value: string): string | undefined => value.trim() || undefined;

/** Whole years, as the contract stores them; blank when not given. */
export const parseAge = (age: string): number | undefined => (age.trim() === '' ? undefined : Number(age));

export const toPatientDetails = (values: RegistrationValues): PatientDetails => {
  if (!values.sex) throw new Error('Choose the patient’s sex');
  const today = new Date().toISOString().slice(0, 10);
  const age = parseAge(values.age);
  if (values.dateOfBirth && (!validCalendarDate(values.dateOfBirth) || values.dateOfBirth > today)) throw new Error('Enter a valid date of birth that is not in the future');
  if (values.dateOfBirth && yearsBetween(values.dateOfBirth, today) > 130) throw new Error('Check the birth date; the age must be between 0 and 130 years');
  if (age !== undefined && (!Number.isInteger(age) || age < 0 || age > 130)) throw new Error('Age must be between 0 and 130 whole years');
  if (values.dateOfBirth && age !== undefined && yearsBetween(values.dateOfBirth, today) !== age) throw new Error('Age and date of birth do not agree');
  const nin = values.nin.replace(/\s/g, '');
  if (nin && !/^\d{11}$/.test(nin)) throw new Error('NIN must contain 11 digits, or leave it blank');
  if (values.identityEvidence === 'document_seen' && !values.identityEvidenceNote.trim()) throw new Error('Describe the identity document checked');
  if (values.identityEvidenceNote.length > 300) throw new Error('Keep the evidence description within 300 characters');
  return ({
  fullName: values.fullName.trim(),
  address: values.address.trim(),
  sex: values.sex === 'F' ? 'female' : 'male',
  ageYears: age,
  ageObservedOn: today,
  dobEstimated: values.dobEstimated || (!values.dateOfBirth && age !== undefined),
  dateOfBirth: optional(values.dateOfBirth),
  phone: optional(values.phone),
  occupation: optional(values.occupation),
  religion: optional(values.religion),
  legacyPaperRef: optional(values.folder),
  nin: optional(nin),
  identityEvidence: values.identityEvidence,
  identityEvidenceNote: values.identityEvidence === 'document_seen' ? optional(values.identityEvidenceNote) : undefined,
  });
};

const isReligion = (value: string | undefined): value is Religion =>
  value === 'christianity' || value === 'islam' || value === 'other';

export const fromPatient = (patient: Patient): RegistrationValues => ({
  fullName: patient.fullName,
  sex: patient.sex === 'female' ? 'F' : 'M',
  age: patient.ageYears === undefined ? '' : String(patientAge(patient)),
  dateOfBirth: patient.dateOfBirth ?? '',
  phone: patient.phone ?? '',
  address: patient.address,
  occupation: patient.occupation ?? '',
  religion: isReligion(patient.religion) ? patient.religion : '',
  folder: patient.legacyPaperRef ?? '',
  dobEstimated: patient.dobEstimated,
  nin: patient.nin ?? '',
  identityEvidence: patient.identityEvidence ?? 'reported',
  identityEvidenceNote: patient.identityEvidenceNote ?? '',
});
