import { DeviceCredential } from '@shared';

/**
 * What this device holds once enrolled: its credential (the trust that lets it
 * sync the facility's data in the background, independent of who is signed in
 * — root §4.3a) and the last time the server was heard from, which is what the
 * offline authorization window is measured against.
 *
 * Stored in localStorage, as the CouchDB credential was. Encrypting it at rest
 * is the open key-management item in geneus-web/PLAN.md §7, unchanged by the
 * migration; the credential is revocable server-side in the meantime.
 */
const CREDENTIAL_KEY = 'geneus.device';
const LAST_CONTACT_KEY = 'geneus.lastServerContactOn';

/** localStorage when there is a window; a Map in tests and workers. */
const memory = new Map<string, string>();
const storage = {
  get: (key: string): string | null =>
    typeof localStorage === 'undefined' ? (memory.get(key) ?? null) : localStorage.getItem(key),
  set: (key: string, value: string): void => {
    if (typeof localStorage === 'undefined') memory.set(key, value);
    else localStorage.setItem(key, value);
  },
  remove: (key: string): void => {
    if (typeof localStorage === 'undefined') memory.delete(key);
    else localStorage.removeItem(key);
  },
};

export const saveDeviceCredential = (credential: DeviceCredential): void =>
  storage.set(CREDENTIAL_KEY, JSON.stringify(credential));

export const getDeviceCredential = (): DeviceCredential | undefined => {
  const raw = storage.get(CREDENTIAL_KEY);
  if (!raw) return undefined;
  const parsed = DeviceCredential.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : undefined;
};

/** De-enrollment: the device forgets who it was. The local database is cleared separately. */
export const clearDeviceCredential = (): void => {
  storage.remove(CREDENTIAL_KEY);
  storage.remove(LAST_CONTACT_KEY);
};

/**
 * The server's clock at the last successful exchange — never the device's own
 * clock, which a cheap phone cannot be trusted to keep (root §4.3).
 */
export const recordServerContact = (serverTime: string): void => storage.set(LAST_CONTACT_KEY, serverTime);

export const lastServerContactOn = (): string | undefined => storage.get(LAST_CONTACT_KEY) ?? undefined;
