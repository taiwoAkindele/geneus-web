import { beforeEach, describe, expect, it, vi } from 'vitest';
import { destroySecureStorage, resetSecureStorageForTests, secureGet, secureSet, unlockSecureStorage } from './secureStorage';
import { memoryStorage } from './testing/memoryStorage';

/**
 * What a copy of this browser's storage would hold: ciphertext only. Node has
 * no IndexedDB, so the device key lives in memory here — the encryption, the
 * reload and the loss of the key are what is under test.
 */
describe('secure storage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    resetSecureStorageForTests();
  });

  it('keeps only ciphertext in localStorage', async () => {
    await secureSet('geneus.device', '{"credential":"device-1.s3cret"}');

    const stored = localStorage.getItem('geneus.device') ?? '';
    expect(stored.startsWith('enc1:')).toBe(true);
    expect(stored).not.toContain('s3cret');
    expect(secureGet('geneus.device')).toBe('{"credential":"device-1.s3cret"}');
  });

  it('reads its secrets back after a reload', async () => {
    await secureSet('geneus.credentials', '{"staff:nurse":{}}');
    resetSecureStorageForTests({ keepKey: true });
    expect(secureGet('geneus.credentials')).toBeNull();

    await unlockSecureStorage();

    expect(secureGet('geneus.credentials')).toBe('{"staff:nurse":{}}');
  });

  it('encrypts a value stored before encryption existed', async () => {
    localStorage.setItem('geneus.lastServerContactOn', '2026-09-30T10:00:00.000Z');

    await unlockSecureStorage();

    expect(secureGet('geneus.lastServerContactOn')).toBe('2026-09-30T10:00:00.000Z');
    expect(localStorage.getItem('geneus.lastServerContactOn')?.startsWith('enc1:')).toBe(true);
  });

  it('drops a value whose device key is gone, rather than failing to start', async () => {
    await secureSet('geneus.device', 'old credential');
    resetSecureStorageForTests();

    await unlockSecureStorage();

    expect(secureGet('geneus.device')).toBeNull();
    expect(localStorage.getItem('geneus.device')).toBeNull();
  });

  it('forgets every secret on de-enrollment', async () => {
    await secureSet('geneus.device', 'credential');
    await secureSet('geneus.dbKey', 'key');

    await destroySecureStorage();

    expect(secureGet('geneus.device')).toBeNull();
    expect(localStorage.length).toBe(0);
  });
});
