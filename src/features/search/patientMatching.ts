import type { Patient } from '@shared';
import type { PatientDetails } from '@/data/repos/patients';
import { sequenceOf } from '@/lib/patientId';

/**
 * Finding patients on the device (PRD §10): search by Patient ID, the number
 * staff say aloud ("patient 47"), phone or name, and the duplicate check run
 * before a new registration. Pure, so both are tested without a database.
 */

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/** Ages within this many years count as the same person's — many ages are estimates. */
const AGE_TOLERANCE_YEARS = 2;

/** Nigerian numbers are written 0803…, 234803… or +234 803…; the last ten digits are the number. */
export const phoneKey = (phone: string | undefined): string | undefined => {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : undefined;
};

const nameTokens = (name: string): string[] =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean);

/** Equal, or one slip of the pen apart on a longer name (Amaka / Ammaka). */
const sameToken = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

/**
 * Same person by name: every part of the shorter name appears in the longer,
 * in any order — "Okoro Amaka" and "Amaka Grace Okoro" both match "Amaka Okoro".
 */
export const namesMatch = (a: string, b: string): boolean => {
  const [shorter, longer] = [nameTokens(a), nameTokens(b)].sort((x, y) => x.length - y.length);
  return shorter.length > 0 && shorter.every((token) => longer.some((other) => sameToken(token, other)));
};

/** Age today: from the date of birth, else the age given at registration plus the years since. */
export const currentAge = (patient: Pick<Patient, 'dateOfBirth' | 'ageYears' | 'createdOn'>, now = Date.now()): number | undefined => {
  if (patient.dateOfBirth) return Math.floor((now - Date.parse(patient.dateOfBirth)) / YEAR_MS);
  if (patient.ageYears === undefined) return undefined;
  return patient.ageYears + Math.floor((now - Date.parse(patient.createdOn)) / YEAR_MS);
};

const candidateAge = (details: PatientDetails, now: number): number | undefined =>
  currentAge({ ...details, createdOn: new Date(now).toISOString() }, now);

export type MatchReason = 'name' | 'phone' | 'age' | 'sex' | 'address';

export type LikelyMatch = { patient: Patient; reasons: MatchReason[] };

/**
 * Registered patients who are probably the person being registered (PRD §10):
 * name, age and sex together; or name and phone together. A shared phone alone
 * is not enough — families often register on one number. Address only adds
 * support. Strongest first: a phone match, then the most reasons.
 */
export const findLikelyMatches = (details: PatientDetails, patients: readonly Patient[], now = Date.now()): LikelyMatch[] => {
  const age = candidateAge(details, now);
  const phone = phoneKey(details.phone);
  return patients
    .map((patient): LikelyMatch => {
      const reasons: MatchReason[] = [];
      if (namesMatch(details.fullName, patient.fullName)) reasons.push('name');
      if (phone && phone === phoneKey(patient.phone)) reasons.push('phone');
      const theirs = currentAge(patient, now);
      if (age !== undefined && theirs !== undefined && Math.abs(age - theirs) <= AGE_TOLERANCE_YEARS) reasons.push('age');
      if (details.sex === patient.sex) reasons.push('sex');
      if (nameTokens(details.address).some((token) => token.length > 3 && nameTokens(patient.address).includes(token))) {
        reasons.push('address');
      }
      return { patient, reasons };
    })
    .filter(({ reasons }) => {
      const has = (reason: MatchReason) => reasons.includes(reason);
      return has('name') && (has('phone') || (has('age') && has('sex')));
    })
    .sort((a, b) => Number(b.reasons.includes('phone')) - Number(a.reasons.includes('phone')) || b.reasons.length - a.reasons.length);
};

/**
 * Patients answering a search, best first: the exact Patient ID, then the
 * registration number on its own ("47"), then phone, then name. An empty
 * query lists the most recently registered first.
 */
export const searchPatients = (patients: readonly Patient[], query: string, facilityCode: string): Patient[] => {
  const text = query.trim();
  const newestFirst = [...patients].sort((a, b) => b.createdOn.localeCompare(a.createdOn));
  if (!text) return newestFirst;

  const upper = text.toUpperCase();
  const digits = text.replace(/\D/g, '');
  const onlyDigits = /^[\d\s+()-]+$/.test(text);
  const rank = (patient: Patient): number | undefined => {
    if (patient.patientId === upper) return 0;
    if (onlyDigits && digits && sequenceOf(patient.patientId, facilityCode) === Number(digits)) return 1;
    if (patient.patientId.includes(upper)) return 2;
    if (onlyDigits && digits.length >= 4 && (patient.phone ?? '').replace(/\D/g, '').includes(digits)) return 3;
    if (!onlyDigits && namesMatchPrefix(text, patient.fullName)) return 4;
    return undefined;
  };
  return newestFirst
    .map((patient) => ({ patient, rank: rank(patient) }))
    .filter((entry): entry is { patient: Patient; rank: number } => entry.rank !== undefined)
    .sort((a, b) => a.rank - b.rank)
    .map((entry) => entry.patient);
};

/** Each typed word begins some part of the name, so "ama oko" finds Amaka Okoro while typing. */
const namesMatchPrefix = (query: string, fullName: string): boolean => {
  const name = nameTokens(fullName);
  const typed = nameTokens(query);
  return typed.length > 0 && typed.every((token) => name.some((part) => part.startsWith(token)));
};
