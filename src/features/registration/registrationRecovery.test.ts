import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetSecureStorageForTests, unlockSecureStorage } from '@/lib/secureStorage';
import { createRegistrationRecovery } from './registrationRecovery';
import { EMPTY_REGISTRATION } from './registrationValues';

const owner = { facilityId: 'TEST-PHC', deviceId: 'device:one', userId: 'staff:one' };
const values = { ...EMPTY_REGISTRATION, fullName: 'Synthetic Registration', sex: 'F' as const, age: '32', address: 'Synthetic address' };
const memoryStorage = () => {
  let value: string | null = null;
  return { read: () => value, write: async (next: string) => { value = next; } };
};

describe('private registration recovery', () => {
  afterEach(() => { resetSecureStorageForTests(); vi.unstubAllGlobals(); });

  it('offers recovery after restart and resumes both form steps', async () => {
    const storage = memoryStorage();
    const first = createRegistrationRecovery(owner, storage);
    first.store.keep('new', { ...values, occupation: 'Teacher', folder: 'old-folder' });
    await first.flush();
    const restarted = createRegistrationRecovery(owner, storage);
    expect(restarted.needsChoice('new')).toBe(true);
    restarted.resume('new');
    expect(restarted.needsChoice('new')).toBe(false);
    expect(restarted.store.read('new')).toMatchObject({ fullName: values.fullName, occupation: 'Teacher', folder: 'old-folder' });
  });

  it('isolates staff, facilities and device enrollments', async () => {
    const storage = memoryStorage();
    const first = createRegistrationRecovery(owner, storage);
    first.store.keep('new', values); await first.flush();
    for (const other of [{ ...owner, userId: 'staff:two' }, { ...owner, facilityId: 'OTHER-PHC' }, { ...owner, deviceId: 'device:two' }]) {
      const recovery = createRegistrationRecovery(other, storage);
      expect(recovery.needsChoice('new')).toBe(false);
      expect(recovery.store.read('new').fullName).toBe('');
    }
  });

  it('preserves separate drafts while switching between patients and a new registration', async () => {
    const storage = memoryStorage();
    const recovery = createRegistrationRecovery(owner, storage);
    recovery.store.keep('new', values);
    recovery.store.keep('patient:one', { ...values, fullName: 'First edit' });
    recovery.store.keep('patient:two', { ...values, fullName: 'Second edit' });
    await recovery.flush();
    await recovery.clear('patient:one');
    const restarted = createRegistrationRecovery(owner, storage);
    expect(restarted.store.read('new').fullName).toBe(values.fullName);
    expect(restarted.store.read('patient:one').fullName).toBe('');
    expect(restarted.store.read('patient:two').fullName).toBe('Second edit');
  });

  it('discards only the selected draft and preserves a colleague’s recovery', async () => {
    const storage = memoryStorage();
    const first = createRegistrationRecovery(owner, storage);
    first.store.keep('new', values); await first.flush();
    const colleague = createRegistrationRecovery({ ...owner, userId: 'staff:two' }, storage);
    colleague.store.keep('new', { ...values, fullName: 'Other staff draft' }); await colleague.flush();
    await first.discard('new');
    expect(createRegistrationRecovery(owner, storage).needsChoice('new')).toBe(false);
    expect(createRegistrationRecovery({ ...owner, userId: 'staff:two' }, storage).store.read('new').fullName).toBe('Other staff draft');
  });

  it('keeps legacy staff-only drafts during migration', async () => {
    const storage = memoryStorage();
    await storage.write(JSON.stringify({ 'staff:one': { key: 'new', values }, 'staff:two': { key: 'patient:edit', values: { ...values, fullName: 'Legacy colleague' } } }));
    const recovery = createRegistrationRecovery(owner, storage);
    expect(recovery.needsChoice('new')).toBe(true);
    recovery.store.keep('new', { ...values, occupation: 'Updated' }); await recovery.flush();
    expect(createRegistrationRecovery({ ...owner, userId: 'staff:two' }, storage).store.read('patient:edit').fullName).toBe('Legacy colleague');
    expect(JSON.parse(storage.read()!).version).toBe(2);
  });

  it('surfaces persistence failure and succeeds when retry becomes possible', async () => {
    const storage = memoryStorage();
    let available = false;
    const recovery = createRegistrationRecovery(owner, { ...storage, write: async (value) => { if (!available) throw new Error('storage full'); await storage.write(value); } });
    recovery.store.keep('new', values);
    await expect(recovery.flush()).rejects.toThrow('storage full');
    expect(recovery.status().error).toMatch(/could not be saved/);
    expect(recovery.store.read('new').fullName).toBe(values.fullName);
    available = true;
    await recovery.retry();
    expect(recovery.status().error).toBeUndefined();
    expect(createRegistrationRecovery(owner, storage).store.read('new').fullName).toBe(values.fullName);
  });

  it('retains unreadable data and gives a generic error instead of leaking its contents', async () => {
    const storage = memoryStorage();
    await storage.write('{broken synthetic sensitive data');
    const recovery = createRegistrationRecovery(owner, storage);
    expect(recovery.status().error).toMatch(/could not be read/);
    expect(recovery.status().error).not.toContain('sensitive');
    recovery.store.keep('new', values);
    await expect(recovery.flush()).rejects.toThrow();
    expect(storage.read()).toBe('{broken synthetic sensitive data');
  });

  it('does not offer a blank form as recovered work', async () => {
    const storage = memoryStorage();
    const recovery = createRegistrationRecovery(owner, storage);
    recovery.store.keep('new', EMPTY_REGISTRATION); await recovery.flush();
    expect(createRegistrationRecovery(owner, storage).needsChoice('new')).toBe(false);
  });

  it('encrypts drafts at rest and recovers them after secure memory is unlocked again', async () => {
    const disk = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => disk.get(key) ?? null, setItem: (key: string, value: string) => disk.set(key, value), removeItem: (key: string) => disk.delete(key) });
    const recovery = createRegistrationRecovery(owner);
    recovery.store.keep('new', values); await recovery.flush();
    const stored = disk.get('geneus.registrationDrafts')!;
    expect(stored.startsWith('enc1:')).toBe(true);
    expect(stored).not.toContain(values.fullName);
    resetSecureStorageForTests({ keepKey: true });
    await unlockSecureStorage();
    const restarted = createRegistrationRecovery(owner);
    expect(restarted.needsChoice('new')).toBe(true);
    expect(restarted.store.read('new').fullName).toBe(values.fullName);
  });

  it('keeps unsupported or malformed saved versions instead of overwriting them', async () => {
    for (const raw of [JSON.stringify({ version: 3, owners: {} }), JSON.stringify({ version: 2, owners: { [JSON.stringify([owner.facilityId, owner.deviceId, owner.userId])]: [{ key: 'new', values: { fullName: 123 } }] } })]) {
      const storage = memoryStorage(); await storage.write(raw);
      const recovery = createRegistrationRecovery(owner, storage);
      expect(recovery.status().unreadable).toBe(true);
      await expect(recovery.flush()).rejects.toThrow();
      await expect(recovery.discard('new')).rejects.toThrow();
      expect(storage.read()).toBe(raw);
    }
  });
});
