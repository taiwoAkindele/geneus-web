import { organizationRequest } from './organizations';

/**
 * Lab tests are added only by the server, online: it checks permission and
 * duplicates in one transaction and files every test under the facility's
 * Laboratory. The new tests reach this device by sync. The standard list lives on
 * the server; a device sends only the keys it chose.
 */
export type StandardTestOption = { key: string; name: string; specimen: string; classification: string; aliases: string[]; added: boolean };
export type OwnTest = { name: string; specimen: string; classification: string; aliases: string[] };
export type AddedTests = { added: string[]; skipped: string[] };

export const listStandardTests = (actorStaffId: string) =>
  organizationRequest<{ tests: StandardTestOption[] }>('/investigations/standard-tests', actorStaffId);
export const adoptStandardTests = (actorStaffId: string, keys: string[]) =>
  organizationRequest<AddedTests>('/investigations/standard-tests/adopt', actorStaffId, { keys });
export const addOwnTests = (actorStaffId: string, tests: OwnTest[]) =>
  organizationRequest<AddedTests>('/investigations/tests', actorStaffId, { tests });
