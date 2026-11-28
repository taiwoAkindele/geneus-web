import { organizationRequest } from './organizations';
import type { AuthorizationContext, LaboratoryTestInput } from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { ApiError, staffRequest } from './client';
import { forgetStaffSession, staffSessionToken, touchStaffSession } from './staffSession';

/**
 * Lab tests are added only by the server, online: it checks permission and
 * duplicates in one transaction and files every test under the facility's
 * Laboratory. The new tests reach this device by sync. The standard list lives on
 * the server; a device sends only the keys it chose.
 */
export type StandardTestOption = {
  key: string;
  name: string;
  specimen: string;
  classification: string;
  aliases: string[];
  added: boolean;
};

export type OwnTest = { name: string; specimen: string; classification: string; aliases: string[] };

export type AddedTests = { added: string[]; skipped: string[] };

export const listStandardTests = (actorStaffId: string) =>
  organizationRequest<{ tests: StandardTestOption[] }>(
    '/investigations/standard-tests',
    actorStaffId,
  );

export const adoptStandardTests = (actorStaffId: string, keys: string[]) =>
  organizationRequest<AddedTests>('/investigations/standard-tests/adopt', actorStaffId, { keys });

export const addOwnTests = (actorStaffId: string, tests: OwnTest[]) =>
  organizationRequest<AddedTests>('/investigations/tests', actorStaffId, { tests });

const laboratoryCatalogueRequest = async <T>(
  context: AuthorizationContext,
  path: string,
  input: Record<string, unknown>,
) => {
  const device = getDeviceCredential();

  if (!device) {
    throw new Error('This device is not enrolled');
  }

  try {
    const result = await staffRequest<T>(
      path,
      device.credential,
      staffSessionToken(context),
      input,
      context.userId,
    );
    touchStaffSession();
    return result;
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'staff_session_required') {
      forgetStaffSession();
    }

    throw cause;
  }
};

export const saveLaboratoryTests = (
  context: AuthorizationContext,
  tests: readonly LaboratoryTestInput[],
) => laboratoryCatalogueRequest<AddedTests>(context, '/investigations/catalogue', { tests });

export const retireLaboratoryTest = (
  context: AuthorizationContext,
  definitionId: string,
  revision: number,
) =>
  laboratoryCatalogueRequest<{ retired: boolean }>(context, '/investigations/catalogue/retire', {
    definitionId,
    revision,
  });
