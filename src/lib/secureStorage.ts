import { base64ToBytes, bytesToBase64 } from './pbkdf2';

/**
 * The device's secrets at rest: PINs, the device credential, the last server
 * contact and the database key. Each is stored in localStorage encrypted with
 * AES-GCM under one **device key** — a WebCrypto key created on this phone with
 * `extractable: false` and kept in IndexedDB. Scripts in this app can use it;
 * nothing, not even this app, can read it out. So a copy of this browser's
 * storage taken through developer tools, a backup or an export carries only
 * ciphertext, and a PIN hash cannot be taken away and brute-forced elsewhere.
 *
 * What it does not stop (plainly, so nobody relies on it for more): a rooted
 * phone whose browser profile is copied whole, since Chrome on Android does not
 * keep this key in hardware; and code running inside this app, which can use
 * the key as the app does.
 *
 * Reads are synchronous from memory, because PINs and the credential are read
 * while rendering; `unlockSecureStorage` fills that memory once, before the app
 * renders. Writes update memory at once and persist encrypted in the background;
 * await the returned promise where losing the write to a closed tab matters.
 */
const ENCRYPTED_PREFIX = 'enc1:';
const KEY_DATABASE = 'geneus-device-key';
const KEY_STORE = 'keys';
const KEY_ID = 'device';

/** Every name kept here. Anything else in localStorage is not a secret. */
export const SECURE_NAMES = ['geneus.credentials', 'geneus.device', 'geneus.lastServerContactOn', 'geneus.dbKey'] as const;
export type SecureName = (typeof SECURE_NAMES)[number];

const memory = new Map<SecureName, string>();
let deviceKey: Promise<CryptoKey> | undefined;

const hasLocalStorage = (): boolean => typeof localStorage !== 'undefined';
const hasIndexedDb = (): boolean => typeof indexedDB !== 'undefined';

const request = <T>(operation: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });

const openKeyDatabase = (): Promise<IDBDatabase> => {
  const opening = indexedDB.open(KEY_DATABASE, 1);
  opening.onupgradeneeded = () => opening.result.createObjectStore(KEY_STORE);
  return request(opening);
};

const generateKey = (): Promise<CryptoKey> =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']) as Promise<CryptoKey>;

/**
 * The device key, created on first use. Without IndexedDB (tests in Node) it
 * lives in memory only, which is the same as no persistence at all.
 */
const loadDeviceKey = async (): Promise<CryptoKey> => {
  if (!hasIndexedDb()) return generateKey();
  const db = await openKeyDatabase();
  try {
    const existing = await request(db.transaction(KEY_STORE).objectStore(KEY_STORE).get(KEY_ID));
    if (existing instanceof CryptoKey) return existing;
    const created = await generateKey();
    await request(db.transaction(KEY_STORE, 'readwrite').objectStore(KEY_STORE).put(created, KEY_ID));
    return created;
  } finally {
    db.close();
  }
};

const key = (): Promise<CryptoKey> => (deviceKey ??= loadDeviceKey());

const encrypt = async (plain: string): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), new TextEncoder().encode(plain));
  return `${ENCRYPTED_PREFIX}${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
};

const decrypt = async (stored: string): Promise<string> => {
  const [iv, cipher] = stored.slice(ENCRYPTED_PREFIX.length).split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv ?? '') }, await key(), base64ToBytes(cipher ?? ''));
  return new TextDecoder().decode(plain);
};

let writes: Promise<void> = Promise.resolve();
/** Persists in call order, so a later write can never be overtaken by an earlier one. */
const persist = (task: () => Promise<void>): Promise<void> => {
  writes = writes.then(task, task);
  return writes;
};

/**
 * Loads every secret into memory. Values stored before encryption existed are
 * taken as they are and written back encrypted. A value that no longer
 * decrypts — its device key was cleared with the site's IndexedDB — is
 * unreadable for good and is dropped, which leaves the device unenrolled.
 */
export const unlockSecureStorage = async (): Promise<void> => {
  if (!hasLocalStorage()) return;
  for (const name of SECURE_NAMES) {
    const stored = localStorage.getItem(name);
    if (stored === null) continue;
    if (!stored.startsWith(ENCRYPTED_PREFIX)) {
      memory.set(name, stored);
      await persist(async () => localStorage.setItem(name, await encrypt(stored)));
      continue;
    }
    try {
      memory.set(name, await decrypt(stored));
    } catch {
      localStorage.removeItem(name);
    }
  }
};

export const secureGet = (name: SecureName): string | null => memory.get(name) ?? null;

export const secureSet = (name: SecureName, value: string): Promise<void> => {
  memory.set(name, value);
  if (!hasLocalStorage()) return Promise.resolve();
  return persist(async () => localStorage.setItem(name, await encrypt(value)));
};

export const secureRemove = (name: SecureName): Promise<void> => {
  memory.delete(name);
  if (!hasLocalStorage()) return Promise.resolve();
  return persist(async () => localStorage.removeItem(name));
};

/**
 * De-enrollment: forgets every secret and destroys the device key, so anything
 * encrypted under it that is left behind can never be read again — the
 * database included, since its key was one of these secrets.
 */
export const destroySecureStorage = async (): Promise<void> => {
  await Promise.all(SECURE_NAMES.map((name) => secureRemove(name)));
  deviceKey = undefined;
  if (hasIndexedDb()) await request(indexedDB.deleteDatabase(KEY_DATABASE));
};

/**
 * Tests only. By default, back to a fresh device with no secrets and no key;
 * `{ keepKey: true }` is a page reload instead — memory gone, key kept.
 */
export const resetSecureStorageForTests = ({ keepKey = false } = {}): void => {
  memory.clear();
  if (!keepKey) deviceKey = undefined;
  writes = Promise.resolve();
};
