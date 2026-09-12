import type { CrudTransaction, PowerSyncBackendConnector, SyncStatus } from '@powersync/web';

/**
 * The one local database — PowerSync's SQLite — opened lazily and exactly once.
 *
 * Lazily, because the PowerSync client and its SQLite WASM are the heaviest
 * things this app ships and a device that has not enrolled yet has nothing to
 * open: onboarding runs without them. `openDatabase` is the only place they
 * are imported, so they land in their own chunk, loaded when a credential
 * exists (PLAN.md §4, the cheap-Android budget).
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
  waitForFirstSync: (signal?: AbortSignal) => Promise<void>;
  getNextCrudTransaction: () => Promise<CrudTransaction | null>;
};

const DB_FILENAME = 'geneus.sqlite';

let instance: LocalDatabase | undefined;
let opening: Promise<LocalDatabase> | undefined;

export const openDatabase = (): Promise<LocalDatabase> => {
  if (instance) return Promise.resolve(instance);
  opening ??= (async () => {
    const [{ PowerSyncDatabase }, { AppSchema }] = await Promise.all([import('@powersync/web'), import('./schema')]);
    const db = new PowerSyncDatabase({ schema: AppSchema, database: { dbFilename: DB_FILENAME } });
    await db.init();
    instance = db;
    return db;
  })();
  return opening;
};

/** The open database. Screens that read or write sit behind DataProvider, which opened it. */
export const getDatabase = (): LocalDatabase => {
  if (!instance) throw new Error('the local database is not open yet — is this inside DataProvider?');
  return instance;
};

export const isDatabaseOpen = (): boolean => instance !== undefined;

export const setDatabaseForTests = (db: LocalDatabase | undefined): void => {
  instance = db;
  opening = undefined;
};
