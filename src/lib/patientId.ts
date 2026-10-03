import { PATIENT_ID_RE } from '@shared';

/**
 * Minting Patient IDs on the device, offline (PRD §10.1, SCHEMA.md §4):
 * FACILITYCODE-SEQ-XX. The contract owns the format; this owns the minting.
 *
 * SEQ is one above the highest number this device can see for its facility —
 * its own registrations and every other device's that has synced down. Two
 * devices working offline can therefore pick the same number; the safety code
 * is what keeps their IDs apart, and the rare clash of both is caught at
 * upload and sent to the reconcile queue (SCHEMA.md §7).
 */

const SEQUENCE_DIGITS = 6;
export const MAX_SEQUENCE = 10 ** SEQUENCE_DIGITS - 1;

/** No I, O, 0 or 1: staff read IDs aloud and copy them by hand. */
const SAFETY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** The registration number in a Patient ID of this facility, or undefined if it is not one. */
export const sequenceOf = (patientId: string, facilityCode: string): number | undefined => {
  const prefix = `${facilityCode}-`;
  if (!patientId.startsWith(prefix)) return undefined;
  const match = /^(\d{6})-[A-Z0-9]{2}$/.exec(patientId.slice(prefix.length));
  return match ? Number(match[1]) : undefined;
};

export const nextSequence = (facilityCode: string, patientIds: readonly string[]): number => {
  const highest = patientIds.reduce((max, id) => Math.max(max, sequenceOf(id, facilityCode) ?? 0), 0);
  if (highest >= MAX_SEQUENCE) throw new Error(`facility ${facilityCode} has used every Patient ID number`);
  return highest + 1;
};

export const randomSafetyCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(2));
  // 256 is a multiple of the alphabet's 32 letters, so every letter is equally likely.
  return Array.from(bytes, (byte) => SAFETY_CODE_ALPHABET[byte % SAFETY_CODE_ALPHABET.length]).join('');
};

export const formatSequence = (sequence: number): string => String(sequence).padStart(SEQUENCE_DIGITS, '0');

export const formatPatientId = (facilityCode: string, sequence: number, safetyCode: string): string => {
  const id = `${facilityCode}-${formatSequence(sequence)}-${safetyCode}`;
  if (!PATIENT_ID_RE.test(id)) throw new Error(`${id} is not a valid Patient ID`);
  return id;
};

export const mintPatientId = (facilityCode: string, patientIds: readonly string[]): string =>
  formatPatientId(facilityCode, nextSequence(facilityCode, patientIds), randomSafetyCode());
