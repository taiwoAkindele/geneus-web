import { Device } from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { ApiError, postAsDevice } from './client';

/**
 * Facility devices, online (root §4.3c). A device is enrolled by someone
 * signing in on it with their email, password and an emailed code
 * (staffPassword.ts), by an invitation link, or by registering a facility.
 */

/** Online only; the server rechecks the actor and facility before revoking. */
export const revokeFacilityDevice = async (
  id: string,
  revokedBy: string,
  wipe: boolean,
  acceptUnsentWork = false,
): Promise<Device> => {
  const device = getDeviceCredential();

  if (!device) {
    throw new ApiError('not_enrolled', 'This device is not enrolled with a facility');
  }

  return Device.parse(
    await postAsDevice(`/devices/${encodeURIComponent(id)}/revoke`, device.credential, {
      revokedBy,
      wipe,
      ...(acceptUnsentWork ? { acceptUnsentWork: true } : {}),
    }),
  );
};
