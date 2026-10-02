import type { CrudTransaction, PowerSyncBackendConnector, SyncStatus } from '@powersync/web';
import { bytesToBase64 } from '@/lib/pbkdf2';
import { secureGet, secureSet } from '@/lib/secureStorage';

/**
 * The one local database — PowerSync's SQLite — opened lazily and exactly once.
 *
 * Lazily, because the PowerSync client and its SQLite WASM are the heaviest
 * things this app ships and a device that has not enrolled yet has nothing to
 * open: onboarding runs without them. `openDatabase` is the only place they
 * are imported, so they land in their own chunk, loaded when a credential
 * exists (PLAN.md §4, the cheap-Android budget).
 *
 * The file is encrypted at rest (ChaCha20, PowerSync's SQLite3MultipleCiphers
 * build) with a random key that is itself stored encrypted under the device key
 * (src/lib/secureStorage.ts). The key does not depend on anyone's PIN, so the
 * replica keeps syncing with nobody signed in (root §4.3a), and cracking a PIN
 * opens no patient data.
 *
 * Repositories reach it through `getDatabase()`; tests substitute a fake with
 * `setDatabaseForTests`. Only `src/data` may import this module.
 */
export type LocalDatabase = {
  execute: (sql: string, parameters?: unknown[]) => Promise<unknown>;
  getAll: <T>(sql: string, parameters?: unknown[]) => Promise<T[]>;
  getOptional: <T>(sql: string, parameters?: unknown[]) => Promise<T | null>;
  onChangeWithCallback: (handler: { onChange: () => void }, options?: { tables?: string[] }) => () => void;
  registerListener: (listener: { statusChanged?: (status: SyncStatus) => void }) => () => void;
  readonly currentStatus: SyncStatus;
  connect: (connector: PowerSyncBackendConnector) => Promise<void>;
  disconnectAndClear: () => Promise<void>;
  close: () => Promise<void>;
  waitForFirstSync: (signal?: AbortSignal) => Promise<void>;
  getNextCrudTransaction: () => Promise<CrudTransaction | null>;
};

const DB_FILENAME = 'geneus-encrypted.sqlite';
/** The plaintext database from before encryption, kept only until the encrypted one has caught up. */
const LEGACY_FILENAME = 'geneus.sqlite';
const DB_KEY = 'geneus.dbKey';

let instance: LocalDatabase | undefined;
/** The encrypted database while it syncs alongside the legacy one it is replacing; see `openDatabase`. */
let catchingUp: LocalDatabase | undefined;
let opening: Promise<LocalDatabase> | undefined;

const databaseKey = async (): Promise<string> => {
  const existing = secureGet(DB_KEY);
  if (existing) return existing;
  const created = bytesToBase64(crypto.getRandomValues(new Uint8Array(32)));
  await secureSet(DB_KEY, created);
  return created;
};

/** The IndexedDB VFS names its IndexedDB database after the file. */
const indexedDbExists = async (name: string): Promise<boolean> =>
  typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function'
    ? (await indexedDB.databases()).some((database) => database.name === name)
    : false;

const deleteIndexedDb = (name: string): Promise<void> =>
  new Promise((resolve) => {
    const deleting = indexedDB.deleteDatabase(name);
    deleting.onsuccess = () => resolve();
    deleting.onerror = () => resolve();
    // Still open somewhere (another tab): it is deleted once that closes.
    deleting.onblocked = () => resolve();
  });

const pendingUploads = async (db: LocalDatabase): Promise<number> =>
  (await db.getOptional<{ n: number }>('SELECT count(*) AS n FROM ps_crud'))?.n ?? 0;

/**
 * The legacy plaintext database may go only when nothing would be lost:
 * every write made on it has reached the server, and the encrypted copy has
 * completed a sync at least as recent as the legacy one's — so a phone that is
 * offline today still has the roster it needs to sign people in.
 */
export const canRetireLegacy = async (legacy: LocalDatabase, encrypted: LocalDatabase): Promise<boolean> => {
  if ((await pendingUploads(legacy)) > 0) return false;
  const encryptedSync = encrypted.currentStatus;
  if (!encryptedSync.hasSynced || !encryptedSync.lastSyncedAt) return false;
  const legacySynced = legacy.currentStatus.lastSyncedAt;
  return !legacySynced || encryptedSync.lastSyncedAt >= legacySynced;
};

export const openDatabase = (): Promise<LocalDatabase> => {
  if (instance) return Promise.resolve(instance);
  opening ??= (async () => {
    const [{ PowerSyncDatabase }, { AppSchema }] = await Promise.all([import('@powersync/web'), import('./schema')]);
    const open = async (dbFilename: string, encryptionKey?: string): Promise<LocalDatabase> => {
      const db = new PowerSyncDatabase({ schema: AppSchema, database: { dbFilename, encryptionKey } });
      await db.init();
      return db;
    };

    const encrypted = await open(DB_FILENAME, await databaseKey());
    if (!(await indexedDbExists(LEGACY_FILENAME))) {
      instance = encrypted;
      return encrypted;
    }

    const legacy = await open(LEGACY_FILENAME);
    if (await canRetireLegacy(legacy, encrypted)) {
      await legacy.close();
      await deleteIndexedDb(LEGACY_FILENAME);
      instance = encrypted;
      return encrypted;
    }

    // Not yet: work on the legacy database this session while the encrypted
    // one syncs beside it (sync.ts connects both). A later start retires it.
    catchingUp = encrypted;
    instance = legacy;
    return legacy;
  })();
  return opening;
};

/** The encrypted database still catching up with the legacy one, if this session has one. */
export const databaseCatchingUp = (): LocalDatabase | undefined => catchingUp;

/**
 * De-enrollment: clears and deletes every local database. Their key is
 * destroyed with the rest of the device's secrets (sync.ts), so even a copy
 * taken before this point can no longer be opened.
 */
export const destroyDatabases = async (): Promise<void> => {
  for (const db of [instance, catchingUp]) {
    if (!db) continue;
    await db.disconnectAndClear();
    await db.close();
  }
  instance = undefined;
  catchingUp = undefined;
  opening = undefined;
  if (typeof indexedDB !== 'undefined') {
    await deleteIndexedDb(DB_FILENAME);
    await deleteIndexedDb(LEGACY_FILENAME);
  }
};

/** The open database. Screens that read or write sit behind DataProvider, which opened it. */
export const getDatabase = (): LocalDatabase => {
  if (!instance) throw new Error('the local database is not open yet — is this inside DataProvider?');
  return instance;
};

export const isDatabaseOpen = (): boolean => instance !== undefined;

export const setDatabaseForTests = (db: LocalDatabase | undefined): void => {
  instance = db;
  catchingUp = undefined;
  opening = undefined;
};
