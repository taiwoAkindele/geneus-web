import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetSecureStorageForTests, secureGet, unlockSecureStorage } from '@/lib/secureStorage';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { checkPin, hasPin, needsLongerPin, pinLength, setPin } from './credentials';
import { approvePinSetup, isPinSetupApproved, takePinSetupApproval } from './pinApproval';

const stored = () => JSON.parse(secureGet('geneus.credentials') ?? '{}') as Record<string, Record<string, unknown>>;

/**
 * A PIN is only as strong as the number of guesses allowed, so the lockout is
 * the thing under test here — alongside the move to 6 digits, which must not
 * lock out anyone who still has a 4-digit PIN.
 */
describe('PIN credentials', () => {
  const NOW = Date.parse('2026-10-01T09:00:00Z');

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    resetSecureStorageForTests();
  });

  it('accepts the right PIN and refuses a wrong one', async () => {
    await setPin('staff:nurse', '482193');

    expect(hasPin('staff:nurse')).toBe(true);
    expect(pinLength('staff:nurse')).toBe(6);
    expect(await checkPin('staff:nurse', '482193', NOW)).toEqual({ ok: true });
    expect(await checkPin('staff:nurse', '111111', NOW)).toEqual({ ok: false, reason: 'wrong' });
    expect(await checkPin('staff:chew', '482193', NOW)).toEqual({ ok: false, reason: 'no-pin' });
  });

  it('only sets 6-digit PINs', async () => {
    await expect(setPin('staff:nurse', '4821')).rejects.toThrow('6 digits');
    await expect(setPin('staff:nurse', '48219a')).rejects.toThrow('6 digits');
    expect(hasPin('staff:nurse')).toBe(false);
  });

  it('keeps no PIN hash readable in localStorage', async () => {
    await setPin('staff:nurse', '482193');

    expect(localStorage.getItem('geneus.credentials')?.startsWith('enc1:')).toBe(true);
    expect(localStorage.getItem('geneus.credentials')).not.toContain(stored()['staff:nurse']?.hash as string);
  });

  it('locks a person out after five wrong PINs, even against the right one, then lets them in once it passes', async () => {
    await setPin('staff:nurse', '482193');
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await checkPin('staff:nurse', '000000', NOW)).ok).toBe(false);
    }

    expect(await checkPin('staff:nurse', '000000', NOW)).toEqual({ ok: false, reason: 'locked', retryAt: NOW + 60_000 });
    expect(await checkPin('staff:nurse', '482193', NOW + 30_000)).toEqual({ ok: false, reason: 'locked', retryAt: NOW + 60_000 });
    expect(await checkPin('staff:nurse', '482193', NOW + 60_001)).toEqual({ ok: true });
    expect(stored()['staff:nurse']?.failures).toBeUndefined();
  });

  it('doubles the lockout with each further wrong PIN, up to half an hour', async () => {
    await setPin('staff:nurse', '482193');
    let now = NOW;
    let lockout = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const result = await checkPin('staff:nurse', '000000', now);
      if (!result.ok && result.reason === 'locked') {
        lockout = result.retryAt - now;
        now = result.retryAt + 1;
      }
    }
    expect(lockout).toBe(30 * 60_000);
  });

  it('accepts an old 4-digit PIN stored in plaintext, rehashes it, and marks it for replacing', async () => {
    const salt = 'legacy-salt';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:4821`));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('geneus.credentials', JSON.stringify({ 'staff:nurse': { salt, hash } }));
    await unlockSecureStorage();

    expect(pinLength('staff:nurse')).toBe(4);
    expect(await checkPin('staff:nurse', '4821', NOW)).toEqual({ ok: true });
    expect(stored()['staff:nurse']?.iterations).toBeGreaterThan(0);
    expect(needsLongerPin('staff:nurse')).toBe(true);
    expect(await checkPin('staff:nurse', '4821', NOW)).toEqual({ ok: true });

    await setPin('staff:nurse', '482193');
    expect(needsLongerPin('staff:nurse')).toBe(false);
  });
});

describe('PIN setup approval', () => {
  it('is spent by the PIN it allows', () => {
    expect(takePinSetupApproval('staff:nurse')).toBe(false);

    approvePinSetup('staff:nurse');
    expect(isPinSetupApproved('staff:nurse')).toBe(true);
    expect(takePinSetupApproval('staff:nurse')).toBe(true);
    expect(takePinSetupApproval('staff:nurse')).toBe(false);
  });
});
