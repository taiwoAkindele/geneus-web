import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkPin, hasPin, setPin } from './credentials';
import { approvePinSetup, isPinSetupApproved, takePinSetupApproval } from './pinApproval';

/** localStorage, as the browser gives it; Node has none. */
const memoryStorage = (): Storage => {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
};

const stored = () => JSON.parse(localStorage.getItem('geneus.credentials') ?? '{}') as Record<string, Record<string, unknown>>;

/**
 * A 4-digit PIN is only as strong as the number of guesses allowed, so the
 * lockout is the thing under test here, alongside the hash upgrade for PINs
 * set before PBKDF2.
 */
describe('PIN credentials', () => {
  const NOW = Date.parse('2026-10-01T09:00:00Z');

  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('accepts the right PIN and refuses a wrong one', async () => {
    await setPin('staff:nurse', '4821');

    expect(hasPin('staff:nurse')).toBe(true);
    expect(await checkPin('staff:nurse', '4821', NOW)).toEqual({ ok: true });
    expect(await checkPin('staff:nurse', '1111', NOW)).toEqual({ ok: false, reason: 'wrong' });
    expect(await checkPin('staff:chew', '4821', NOW)).toEqual({ ok: false, reason: 'no-pin' });
  });

  it('locks a person out after five wrong PINs, even against the right one, then lets them in once it passes', async () => {
    await setPin('staff:nurse', '4821');
    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await checkPin('staff:nurse', '0000', NOW)).ok).toBe(false);
    }

    expect(await checkPin('staff:nurse', '0000', NOW)).toEqual({ ok: false, reason: 'locked', retryAt: NOW + 60_000 });
    expect(await checkPin('staff:nurse', '4821', NOW + 30_000)).toEqual({ ok: false, reason: 'locked', retryAt: NOW + 60_000 });
    expect(await checkPin('staff:nurse', '4821', NOW + 60_001)).toEqual({ ok: true });
    expect(stored()['staff:nurse']?.failures).toBeUndefined();
  });

  it('doubles the lockout with each further wrong PIN, up to half an hour', async () => {
    await setPin('staff:nurse', '4821');
    let now = NOW;
    let lockout = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const result = await checkPin('staff:nurse', '0000', now);
      if (!result.ok && result.reason === 'locked') {
        lockout = result.retryAt - now;
        now = result.retryAt + 1;
      }
    }
    expect(lockout).toBe(30 * 60_000);
  });

  it('upgrades a PIN stored before PBKDF2 the next time it is used', async () => {
    const salt = 'legacy-salt';
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:4821`));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('geneus.credentials', JSON.stringify({ 'staff:nurse': { salt, hash } }));

    expect(await checkPin('staff:nurse', '4821', NOW)).toEqual({ ok: true });
    expect(stored()['staff:nurse']?.iterations).toBeGreaterThan(0);
    expect(await checkPin('staff:nurse', '4821', NOW)).toEqual({ ok: true });
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
