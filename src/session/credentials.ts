import { pbkdf2Base64, randomSalt, sameText } from '@/lib/pbkdf2';

/**
 * PINs are held on the device only and never enter the replica: the contract
 * keeps credentials out of documents, and the device — not geneus-server — owns
 * them permanently, because offline login must work with no network (SCHEMA.md
 * §10).
 *
 * A 4-digit PIN has 10,000 values, so what protects it is how many guesses
 * someone gets. At the keypad that is the lockout below. Against someone who
 * copies this browser's storage, PBKDF2 only slows them down — that needs the
 * device encryption still open in PLAN.md §7.
 */
const STORAGE_KEY = 'geneus.credentials';

/** Slow enough to matter, fast enough that a sub-$100 phone signs in without a visible wait. */
const PIN_ITERATIONS = 100_000;

/** Wrong PINs allowed before the first lockout. */
const FREE_ATTEMPTS = 5;
const FIRST_LOCKOUT_MS = 60_000;
const MAX_LOCKOUT_MS = 30 * 60_000;

type Credential = {
  salt: string;
  hash: string;
  /** Absent on PINs stored before PBKDF2: those are one round of salted SHA-256, upgraded at the next sign-in. */
  iterations?: number;
  failures?: number;
  lockedUntil?: number;
};
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

const update = (staffId: string, change: (credential: Credential) => Credential) => {
  const store = read();
  const credential = store[staffId];
  if (credential) write({ ...store, [staffId]: change(credential) });
};

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

const legacyHash = async (pin: string, salt: string): Promise<string> =>
  toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`)));

const hashOf = (pin: string, credential: Credential): Promise<string> =>
  credential.iterations ? pbkdf2Base64(pin, credential.salt, credential.iterations) : legacyHash(pin, credential.salt);

/** Sets or replaces a PIN, clearing any lockout. Callers check the approval first (pinApproval.ts). */
export const setPin = async (staffId: string, pin: string): Promise<void> => {
  const salt = randomSalt();
  const hash = await pbkdf2Base64(pin, salt, PIN_ITERATIONS);
  write({ ...read(), [staffId]: { salt, hash, iterations: PIN_ITERATIONS } });
};

export type PinCheck = { ok: true } | { ok: false; reason: 'no-pin' | 'wrong' } | { ok: false; reason: 'locked'; retryAt: number };

const lockoutAfter = (failures: number): number | undefined =>
  failures < FREE_ATTEMPTS ? undefined : Math.min(FIRST_LOCKOUT_MS * 2 ** (failures - FREE_ATTEMPTS), MAX_LOCKOUT_MS);

/**
 * Checks a PIN and counts the attempt. Five wrong PINs in a row lock that
 * person out for a minute, and each further wrong PIN doubles it, up to half an
 * hour; a right one resets the count.
 */
export const checkPin = async (staffId: string, pin: string, now = Date.now()): Promise<PinCheck> => {
  const credential = read()[staffId];
  if (!credential) return { ok: false, reason: 'no-pin' };
  if (credential.lockedUntil && credential.lockedUntil > now) return { ok: false, reason: 'locked', retryAt: credential.lockedUntil };

  if (!sameText(await hashOf(pin, credential), credential.hash)) {
    const failures = (credential.failures ?? 0) + 1;
    const lockout = lockoutAfter(failures);
    update(staffId, (current) => ({ ...current, failures, lockedUntil: lockout ? now + lockout : undefined }));
    return lockout ? { ok: false, reason: 'locked', retryAt: now + lockout } : { ok: false, reason: 'wrong' };
  }

  if (credential.iterations) update(staffId, ({ salt, hash, iterations }) => ({ salt, hash, iterations }));
  else await setPin(staffId, pin);
  return { ok: true };
};

/**
 * Whether this staff member has a PIN on this device. Read at render rather
 * than cached with the roster: PINs live outside the replica, so setting one
 * fires no database change to refresh a cached copy.
 */
export const hasPin = (staffId: string): boolean => Boolean(read()[staffId]);
