import { describe, expect, it } from 'vitest';
import { rememberPlace, takePlace } from './lastPlace';

describe('returning to the last place after signing back in', () => {
  it('returns the same person at the same facility to where they were, once', () => {
    rememberPlace('s1', 'F1', '/patients/profile?patient=P1&tab=now');
    expect(takePlace('s1', 'F1')).toBe('/patients/profile?patient=P1&tab=now');
    expect(takePlace('s1', 'F1')).toBeUndefined();
  });
  it('never hands one person’s place to another member of staff or facility', () => {
    rememberPlace('s1', 'F1', '/billing');
    expect(takePlace('s2', 'F1')).toBeUndefined();
    rememberPlace('s1', 'F1', '/billing');
    expect(takePlace('s1', 'F2')).toBeUndefined();
  });
  it('ignores home and sign-in pages', () => {
    rememberPlace('s1', 'F1', '/home');
    expect(takePlace('s1', 'F1')).toBeUndefined();
  });
});
