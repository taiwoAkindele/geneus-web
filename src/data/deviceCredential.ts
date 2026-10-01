import { DeviceCredential } from '@shared';
import { secureGet, secureRemove, secureSet } from '@/lib/secureStorage';

/**
 * What this device holds once enrolled: its credential (the trust that lets it
 * sync the facility's data in the background, independent of who is signed in
 * — root §4.3a) and the last time the server was heard from, which is what the
 * offline authorization window is measured against.
 *
 * Both are kept encrypted under the device key (src/lib/secureStorage.ts), so
 * a copied credential is useless away from this phone; it is also revocable
 * server-side.
 */
const CREDENTIAL_KEY = 'geneus.device';
const LAST_CONTACT_KEY = 'geneus.lastServerContactOn';

/** Resolves once the credential is stored encrypted — await it before relying on a reload keeping it. */
export const saveDeviceCredential = (credential: DeviceCredential): Promise<void> =>
  secureSet(CREDENTIAL_KEY, JSON.stringify(credential));

export const getDeviceCredential = (): DeviceCredential | undefined => {
  const raw = secureGet(CREDENTIAL_KEY);
  if (!raw) return undefined;
  const parsed = DeviceCredential.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : undefined;
};

/** De-enrollment: the device forgets who it was. The local database is cleared separately. */
export const clearDeviceCredential = (): void => {
  void secureRemove(CREDENTIAL_KEY);
  void secureRemove(LAST_CONTACT_KEY);
};

/**
 * The server's clock at the last successful exchange — never the device's own
 * clock, which a cheap phone cannot be trusted to keep (root §4.3).
 */
export const recordServerContact = (serverTime: string): void => void secureSet(LAST_CONTACT_KEY, serverTime);

export const lastServerContactOn = (): string | undefined => secureGet(LAST_CONTACT_KEY) ?? undefined;
