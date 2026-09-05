import PouchDB from 'pouchdb-browser';
import type { SyncCredential } from '@/lib/api/facilities';
import { db } from './db';

/**
 * The device's sync credential — the trust that lets this phone replicate the
 * facility's data in the background, independent of who is logged in on screen
 * (root §4.3a). It is issued once at registration and stays on the device.
 */
const STORAGE_KEY = 'geneus.sync';

export const saveSyncCredential = (credential: SyncCredential): void =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(credential));

export const getSyncCredential = (): SyncCredential | undefined => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as SyncCredential;
  } catch {
    return undefined;
  }
};

const remoteFor = (credential: SyncCredential) =>
  new PouchDB(`${credential.url}/${credential.database}`, {
    auth: { username: credential.username, password: credential.password },
  });

/**
 * Brings the facility's existing documents down once. Continuous background
 * replication is the next step; until then this is what puts the facility and
 * its first account on the device after registration.
 */
export const pullOnce = async (credential: SyncCredential): Promise<void> => {
  await db.replicate.from(remoteFor(credential));
};
