import { OrganizationFacilityDirectory, OrganizationFacilityRegistration, OrganizationFacilityResult, type OrganizationFacilityOpen } from '@shared';
import { secureGet, secureRemove, secureSet } from '@/lib/secureStorage';

const DIRECTORY = 'geneus.organizationFacilities';
const CREATION = 'geneus.facilityCreation';
const OPENING = 'geneus.facilityOpening';
const parse = <T,>(raw: string | null): T | undefined => raw ? JSON.parse(raw) as T : undefined;
const keyFor = (facilityId: string, staffId: string) => JSON.stringify([facilityId, staffId]);
type DirectoryCache = Record<string, { directory: OrganizationFacilityDirectory; savedOn: string }>;

export const cachedFacilityDirectory = (facilityId: string, staffId: string) => {
  const value = parse<DirectoryCache>(secureGet(DIRECTORY))?.[keyFor(facilityId, staffId)];
  return value ? { ...value, directory: OrganizationFacilityDirectory.parse(value.directory) } : undefined;
};
export const cacheFacilityDirectory = async (facilityId: string, staffId: string, directory: OrganizationFacilityDirectory) => {
  const cache = parse<DirectoryCache>(secureGet(DIRECTORY)) ?? {};
  const key = keyFor(facilityId, staffId);
  delete cache[key];
  const entries = Object.entries(cache).slice(-19);
  await secureSet(DIRECTORY, JSON.stringify(Object.fromEntries([...entries, [key, { directory: OrganizationFacilityDirectory.parse(directory), savedOn: new Date().toISOString() }]])));
};

export const enrollmentProof = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return { deviceId: crypto.randomUUID(), deviceSecret: btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') };
};
export type PendingFacilityCreation = { sourceFacilityId: string; payload: OrganizationFacilityRegistration; result?: OrganizationFacilityResult };
export const pendingFacilityCreation = (facilityId: string, staffId: string): PendingFacilityCreation | undefined => {
  const value = parse<Record<string, PendingFacilityCreation>>(secureGet(CREATION))?.[keyFor(facilityId, staffId)];
  if (!value) return;
  return { ...value, payload: OrganizationFacilityRegistration.parse(value.payload), ...(value.result ? { result: OrganizationFacilityResult.parse(value.result) } : {}) };
};
export const saveFacilityCreation = (value: PendingFacilityCreation) => {
  const pending = parse<Record<string, PendingFacilityCreation>>(secureGet(CREATION)) ?? {};
  pending[keyFor(value.sourceFacilityId, value.payload.actorStaffId)] = { ...value, payload: OrganizationFacilityRegistration.parse(value.payload), ...(value.result ? { result: OrganizationFacilityResult.parse(value.result) } : {}) };
  return secureSet(CREATION, JSON.stringify(pending));
};
export const clearFacilityCreation = (facilityId: string, staffId: string) => {
  const pending = parse<Record<string, PendingFacilityCreation>>(secureGet(CREATION)) ?? {};
  delete pending[keyFor(facilityId, staffId)];
  return secureSet(CREATION, JSON.stringify(pending));
};

export const facilityOpeningProof = async (facilityId: string, staffId: string, targetFacilityId: string) => {
  const created = pendingFacilityCreation(facilityId, staffId);
  if (created?.result?.facility.id === targetFacilityId) return { deviceId: created.payload.deviceId, deviceSecret: created.payload.deviceSecret };
  const pending = parse<Record<string, OrganizationFacilityOpen>>(secureGet(OPENING)) ?? {};
  const key = JSON.stringify([facilityId, staffId, targetFacilityId]);
  const previous = pending[key];
  if (previous) return { deviceId: previous.deviceId, deviceSecret: previous.deviceSecret! };
  const proof = enrollmentProof();
  pending[key] = { actorStaffId: staffId, facilityId: targetFacilityId, ...proof };
  await secureSet(OPENING, JSON.stringify(pending));
  return proof;
};

/** Only clear a receipt once the corresponding enrollment is durably activated. */
export const finishFacilitySetup = async (targetFacilityId: string) => {
  const created = parse<Record<string, PendingFacilityCreation>>(secureGet(CREATION)) ?? {};
  const retained = Object.entries(created).filter(([, value]) => value.result?.facility.id !== targetFacilityId);
  if (retained.length) await secureSet(CREATION, JSON.stringify(Object.fromEntries(retained))); else await secureRemove(CREATION);
  const opening = parse<Record<string, OrganizationFacilityOpen>>(secureGet(OPENING)) ?? {};
  const remaining = Object.entries(opening).filter(([, value]) => value.facilityId !== targetFacilityId);
  if (remaining.length) await secureSet(OPENING, JSON.stringify(Object.fromEntries(remaining))); else await secureRemove(OPENING);
};
