/**
 * Registration form values (PRD §10 — NASADOR).
 *
 * These are the raw form inputs, not the persisted document. Number/date inputs
 * come back as strings; they are normalized to the shared `Patient` document
 * shape at the persistence boundary (integration step), never stored raw.
 */
export type PatientFormValues = {
  fullName: string;
  address: string;
  sex: 'female' | 'male';
  ageYears?: string;
  dateOfBirth?: string;
  phone?: string;
};
