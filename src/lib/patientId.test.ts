import { describe, expect, it } from 'vitest';
import { PATIENT_ID_RE } from '@shared';
import { MAX_SEQUENCE, mintPatientId, nextSequence, randomSafetyCode, sequenceOf } from './patientId';

describe('Patient ID minting', () => {
  it('numbers the next patient one above the highest this device can see', () => {
    const seen = ['OOE-PHC-000047-K2', 'OOE-PHC-000003-AB', 'OOE-PHC-000046-ZZ'];

    expect(nextSequence('OOE-PHC', seen)).toBe(48);
  });

  it('starts a new facility at 1', () => {
    expect(nextSequence('OOE-PHC', [])).toBe(1);
  });

  /** "OOE-PHC-…" also starts with "OOE-", so the prefix alone must not match. */
  it("ignores another facility's numbers, even when one code begins with the other", () => {
    expect(sequenceOf('OOE-PHC-000047-K2', 'OOE')).toBeUndefined();
    expect(nextSequence('OOE', ['OOE-PHC-000900-K2', 'OOE-000012-AB'])).toBe(13);
  });

  it('mints an ID in the contract format, for one-segment codes too', () => {
    expect(mintPatientId('OOE-PHC', ['OOE-PHC-000047-K2'])).toMatch(/^OOE-PHC-000048-[A-Z2-9]{2}$/);
    expect(mintPatientId('OOE', [])).toMatch(PATIENT_ID_RE);
  });

  it('never uses letters that read aloud ambiguously in the safety code', () => {
    for (let i = 0; i < 200; i += 1) expect(randomSafetyCode()).toMatch(/^[A-HJ-NP-Z2-9]{2}$/);
  });

  it('fails loudly rather than wrap when the numbers run out', () => {
    expect(() => nextSequence('OOE', [`OOE-${MAX_SEQUENCE}-AB`])).toThrow(/every Patient ID number/);
  });
});
