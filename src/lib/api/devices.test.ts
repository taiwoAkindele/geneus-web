import { describe, expect, it } from 'vitest';
import { normalizeEnrollmentCode } from './devices';

describe('device codes', () => {
  it('ignores the spaces, dashes and case of a code read aloud', () => {
    expect(normalizeEnrollmentCode(' k7m2 qx9r ')).toBe('K7M2QX9R');
    expect(normalizeEnrollmentCode('K7M2-QX9R')).toBe('K7M2QX9R');
  });
});
