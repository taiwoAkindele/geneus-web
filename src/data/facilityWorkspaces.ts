import { DeviceCredential } from '@shared';
import { secureGet, secureRemove, secureSet, type SecureName } from '@/lib/secureStorage';
import { assertSourceSession, clearFacilityIdentity, reuseAccountPin, saveFacilityIdentity, sharesAccountPin, type FacilitySwitchIdentity } from '@/session/facilityIdentity';
import { finishFacilitySetup, pendingFacilityCreation } from './facilitySetup';

const KEY = 'geneus.facilityWorkspaces';
const ACTIVE = 'geneus.activeFacilityEnrollment';
const SCOPED: SecureName[] = ['geneus.device', 'geneus.dbKey', 'geneus.credentials', 'geneus.lastServerContactOn', 'geneus.workforce.selections', 'geneus.registrationDrafts'];
export type FacilityWorkspace = { facilityId: string; deviceId: string; name: string; databaseName: string; legacy: boolean; prepared?: boolean; values: Partial<Record<SecureName, string>>; pending?: number };
type Directory = { active?: string; pendingActivation?: string; pendingIdentity?: FacilitySwitchIdentity; entries: FacilityWorkspace[] };
const read = (): Directory => {
  const raw = secureGet(KEY);
  if (!raw) return { entries: [] };
  try { return JSON.parse(raw) as Directory; } catch { throw new Error('Facility workspaces could not be read. Do not clear this device; contact support.'); }
};
const write = (value: Directory) => secureSet(KEY, JSON.stringify(value));
export const recoverWorkspaceActivation = async () => {
  const directory = read();
  if (!directory.pendingActivation) return;
  const target = directory.entries.find((e) => e.deviceId === directory.pendingActivation);
  if (!target) throw new Error('The pending facility workspace is missing. Contact support without clearing storage.');
  const identity = directory.pendingIdentity;
  if (identity && (identity.facilityId !== target.facilityId || identity.deviceId !== target.deviceId)) throw new Error('The pending facility identity does not match its workspace');
  for (const key of SCOPED) { const value = target.values[key]; if (value === undefined) await secureRemove(key); else await secureSet(key, value); }
  localStorage.removeItem('geneus.signedInStaffId');
  localStorage.removeItem('geneus.lastActivityOn');
  if (identity) {
    await saveFacilityIdentity(identity);
    localStorage.setItem('geneus.signedInStaffId', identity.staffId);
    localStorage.setItem('geneus.lastActivityOn', String(identity.createdOn));
  } else await clearFacilityIdentity();
  directory.active = target.deviceId;
  delete directory.pendingActivation;
  delete directory.pendingIdentity;
  await write(directory);
  localStorage.setItem(ACTIVE, target.deviceId);
  await finishFacilitySetup(target.facilityId);
};
export const listFacilityWorkspaces = () => read().entries.map(({ values: _values, ...item }) => item);
export const activeWorkspace = () => { const d = read(); return d.entries.find((e) => e.deviceId === d.active); };
export const activeEnrollmentMarker = () => typeof localStorage === 'undefined' ? undefined : localStorage.getItem(ACTIVE) ?? undefined;

/** Adopt the original database in place; no clinical rows or pending transactions are copied. */
export const ensureFacilityWorkspace = async (credential: DeviceCredential) => {
  const directory = read();
  if (!directory.entries.some((e) => e.deviceId === credential.deviceId)) {
    directory.entries.push({ facilityId: credential.facilityId, deviceId: credential.deviceId, name: credential.facilityId, databaseName: directory.entries.length ? `geneus-${encodeURIComponent(credential.deviceId)}.sqlite` : 'geneus-encrypted.sqlite', legacy: !directory.entries.length, values: {} });
  }
  directory.active = credential.deviceId;
  await write(directory);
  if (typeof localStorage !== 'undefined') localStorage.setItem(ACTIVE, credential.deviceId);
};
export const markWorkspacePrepared = async (expectedDeviceId: string) => {
  const directory = read(), entry = directory.entries.find((e) => e.deviceId === directory.active);
  if (entry && entry.deviceId === expectedDeviceId && !entry.prepared) { entry.prepared = true; await write(directory); }
};
export const nameActiveWorkspace = async (name: string) => {
  const directory = read(), entry = directory.entries.find((e) => e.deviceId === directory.active);
  if (entry && entry.name !== name) { entry.name = name; await write(directory); }
};
const flushers = new Set<() => Promise<unknown> | void>();
export const registerWorkspaceFlusher = (flush: () => Promise<unknown> | void) => { flushers.add(flush); return () => { flushers.delete(flush); }; };
let releaseTab: (() => void) | undefined;
let tabLock: Promise<unknown> | undefined;
export const holdWorkspaceTab = () => {
  if (typeof navigator !== 'undefined' && navigator.locks && !tabLock) {
    tabLock = navigator.locks.request('geneus-facility-workspace', { mode: 'shared' }, () => new Promise<void>((resolve) => { releaseTab = resolve; }));
  }
};
let switching = false;
export const isWorkspaceSwitching = () => switching;

/** A full reload discards all old provider/session state; queues remain in their original databases. */
export const switchFacilityWorkspace = async (deviceId: string, issued?: DeviceCredential, identity?: FacilitySwitchIdentity) => {
  if (switching) throw new Error('A facility switch is already in progress');
  if (!navigator.locks) throw new Error('This browser cannot safely coordinate facility switching. Use a current supported browser.');
  if (identity) assertSourceSession(identity);
  await Promise.all([...flushers].map((flush) => flush()));
  // Let local draft transactions settle before closing the old database.
  const { getDatabase, isDatabaseOpen } = await import('./database');
  const db = isDatabaseOpen() ? getDatabase() : undefined;
  if (db) await db.writeTransaction(async () => {});
  const pending = db ? await db.getAll<{ n: number }>('SELECT count(*) AS n FROM ps_crud') : [];
  if (tabLock && !releaseTab) await new Promise((resolve) => setTimeout(resolve, 0));
  releaseTab?.(); await tabLock; releaseTab = undefined; tabLock = undefined;
  let moved = false;
  let continuation = identity;
  try {
    await navigator.locks.request('geneus-facility-workspace', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) throw new Error('Close other Geneus tabs before switching facilities. Their drafts and records must finish saving first.');
      const directory = read();
      const current = directory.entries.find((e) => e.deviceId === directory.active);
      let target = directory.entries.find((e) => e.deviceId === deviceId);
      if (issued) {
        DeviceCredential.parse(issued);
        if (directory.entries.some((e) => e.facilityId === issued.facilityId)) throw new Error('This facility already has a workspace on this device');
        target = { facilityId: issued.facilityId, deviceId: issued.deviceId, name: issued.facilityId, databaseName: `geneus-${encodeURIComponent(issued.deviceId)}.sqlite`, legacy: false, values: { 'geneus.device': JSON.stringify(issued) } };
        directory.entries.push(target);
      }
      if (!target) throw new Error('This facility is not enrolled on this device');
      if (identity) {
        assertSourceSession(identity);
        if (identity.facilityId !== target.facilityId || identity.deviceId !== target.deviceId) throw new Error('The account does not match the selected facility');
      }
      if (!target.prepared && navigator.onLine === false) throw new Error('Connect to the internet and complete this facility?s first synchronization before opening it offline');
      if (current?.deviceId === target.deviceId) return;
      if (current) {
        current.values = Object.fromEntries(SCOPED.flatMap((key) => { const value = secureGet(key); return value === null ? [] : [[key, value]]; }));
        current.pending = Number(pending[0]?.n ?? 0);
      }
      if (identity) {
        const creation = current && pendingFacilityCreation(current.facilityId, identity.sourceStaffId);
        const registered = creation?.result;
        // Only the freshly registered first administrator can initialize a PIN
        // from another workspace. Provisioning alone is never PIN approval.
        if (issued && registered?.device.credential === issued.credential && registered.facility.id === target.facilityId && registered.admin.staffId === identity.staffId && registered.admin.personId === identity.personId && registered.admin.role === 'facility_admin') {
          target.values['geneus.credentials'] = reuseAccountPin(current?.values['geneus.credentials'], target.values['geneus.credentials'], identity.sourceStaffId, identity.staffId);
        }
        if (sharesAccountPin(current?.values['geneus.credentials'], target.values['geneus.credentials'], identity.sourceStaffId, identity.staffId)) directory.pendingIdentity = identity;
        else { continuation = undefined; delete directory.pendingIdentity; }
      } else delete directory.pendingIdentity;
      switching = true;
      if (db) await db.close();
      // Persist the complete old snapshot before replacing the active secret slots.
      directory.pendingActivation = target.deviceId; await write(directory);
      await recoverWorkspaceActivation();
      moved = true;
      window.location.replace(continuation ? '/home' : '/login');
    });
  } finally { if (!moved) { if (switching) window.location.replace('/login'); else holdWorkspaceTab(); } }
};

export const forgetActiveWorkspace = async () => {
  const directory = read();
  directory.entries = directory.entries.filter((e) => e.deviceId !== directory.active);
  directory.active = undefined;
  for (const name of SCOPED) await secureRemove(name);
  await write(directory);
  localStorage.removeItem(ACTIVE);
};
