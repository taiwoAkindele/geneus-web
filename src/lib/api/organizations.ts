import {
  OrganizationFacilityAccess,
  OrganizationFacilityDefaults,
  OrganizationFacilityDirectory,
  OrganizationFacilityResult,
  type OrganizationFacilityRegistration,
  type OrganizationSummary,
  type ProvisionRequestSummary,
} from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { ApiError, postAsDevice, staffRequest } from './client';
import { staffSessionToken } from './staffSession';

export const organizationRequest = <T>(
  path: string,
  actorStaffId: string,
  values: Record<string, unknown> = {},
): Promise<T> => {
  const device = getDeviceCredential();

  if (!device) {
    return Promise.reject(new Error('This facility is not enrolled'));
  }

  return postAsDevice<T>(path, device.credential, { actorStaffId, ...values });
};

export const currentOrganization = (actorStaffId: string) =>
  organizationRequest<{
    organization: OrganizationSummary | null;
    requests: ProvisionRequestSummary[];
  }>('/organization/current', actorStaffId);

export const listOrganizationFacilities = async (actorStaffId: string) =>
  OrganizationFacilityDirectory.parse(
    await organizationRequest('/organization/facilities/list', actorStaffId),
  );

export const organizationFacilityDefaults = async (actorStaffId: string) =>
  OrganizationFacilityDefaults.parse(
    await organizationRequest('/organization/facilities/defaults', actorStaffId),
  );

export const createOrganizationFacility = async (input: OrganizationFacilityRegistration) =>
  OrganizationFacilityResult.parse(
    await organizationRequest('/organization/facilities', input.actorStaffId, input),
  );

/**
 * Opening another facility carries the person's sign-in there, so the server
 * needs their proven session here, not only the staff id the device names.
 */
const openFacilityAsSignedIn = (
  actorStaffId: string,
  facilityId: string,
  proof: { deviceId: string; deviceSecret?: string },
) => {
  const device = getDeviceCredential();

  if (!device) {
    return Promise.reject(new Error('This facility is not enrolled'));
  }

  const session = staffSessionToken({ userId: actorStaffId, deviceId: device.deviceId });

  return staffRequest<unknown>('/organization/facilities/open', device.credential, session, {
    actorStaffId,
    facilityId,
    ...proof,
  });
};

export const openOrganizationFacility = async (
  actorStaffId: string,
  facilityId: string,
  proof: { deviceId: string; deviceSecret?: string },
) =>
  OrganizationFacilityAccess.parse(await openFacilityAsSignedIn(actorStaffId, facilityId, proof));

/**
 * An unreliable online flag must not strand a prepared replica; an access refusal is authoritative.
 * With no server session here (signed in offline), a prepared replica opens as an offline switch does.
 */
export const resolveOrganizationFacility = async (
  actorStaffId: string,
  facilityId: string,
  proof: { deviceId: string; deviceSecret?: string },
  prepared: boolean,
) => {
  try {
    return await openOrganizationFacility(actorStaffId, facilityId, proof);
  } catch (cause) {
    if (
      prepared &&
      cause instanceof ApiError &&
      (cause.code === 'offline' ||
        cause.code === 'staff_session_required' ||
        (cause.status ?? 0) >= 500)
    ) {
      return undefined;
    }

    throw cause;
  }
};
