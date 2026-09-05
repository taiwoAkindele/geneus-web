/**
 * PINs are held on the device only and never enter the replica: the contract
 * keeps credentials out of documents, and the device — not geneus-server — owns
 * them permanently, because offline login must work with no network (SCHEMA.md
 * §8). Salted SHA-256 means a stored value can be checked offline without
 * keeping the PIN itself.
 */
const STORAGE_KEY = 'geneus.credentials';

type Credential = { salt: string; hash: string };
type Store = Record<string, Credential>;

const read = (): Store => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
};

const write = (store: Store) => localStorage.setItem(STORAGE_KEY, JSON.stringify(store));

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const hashPin = async (pin: string, salt: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`));
  return toHex(digest);
};

export const setPin = async (staffId: string, pin: string): Promise<void> => {
  const salt = crypto.randomUUID?.() ?? String(Date.now());
  write({ ...read(), [staffId]: { salt, hash: await hashPin(pin, salt) } });
};

export const verifyPin = async (staffId: string, pin: string): Promise<boolean> => {
  const credential = read()[staffId];
  if (!credential) return false;
  return (await hashPin(pin, credential.salt)) === credential.hash;
};

/**
 * Whether this staff member has accepted their invite on this device. Read at
 * render rather than cached with the roster: PINs live outside the replica, so
 * setting one fires no database change to refresh a cached copy.
 */
export const hasPin = (staffId: string): boolean => Boolean(read()[staffId]);
