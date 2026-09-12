import { createConnector } from './connector';
import { openDatabase, type LocalDatabase } from './database';
import { clearDeviceCredential } from './deviceCredential';

/**
 * Starting and stopping synchronisation for this device. PowerSync does the
 * work — connecting, downloading, queueing, uploading, retrying — once
 * `connect` has been called; this file decides when, and what happens when the
 * server says the device is no longer enrolled.
 */
const FIRST_SYNC_TIMEOUT_MS = 30_000;

/**
 * De-enrollment as the device experiences it: its credential stops working.
 * The local replica is cleared — it is the facility's data, not the phone's
 * (root §4.3c) — and the app restarts into onboarding. Unsynced local writes
 * are lost with it; the server would have refused them anyway.
 */
const onDeenrolled = async (): Promise<void> => {
  const db = await openDatabase();
  await db.disconnectAndClear();
  clearDeviceCredential();
  if (typeof window !== 'undefined') window.location.replace('/onboarding/start');
};

/**
 * Opens the database and connects it. Idempotent: PowerSync ignores a second
 * connect with the same connector, and the database opens once.
 */
export const startSync = async (): Promise<LocalDatabase> => {
  const db = await openDatabase();
  await db.connect(createConnector({ onDeenrolled }));
  return db;
};

/**
 * Right after enrollment the device holds nothing: the facility and the first
 * account are on the server and must come down before anything can be shown
 * or stamped. Bounded, because a registration screen must never hang forever
 * on a 2G link — after the timeout the app proceeds and sync carries on.
 */
export const waitForFirstSync = async (db: LocalDatabase, timeoutMs = FIRST_SYNC_TIMEOUT_MS): Promise<boolean> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await db.waitForFirstSync(controller.signal);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};
