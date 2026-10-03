import type { DeviceCredential, EnrollmentCode } from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { ApiError, post, postAsDevice } from './client';

/**
 * Enrolling a second device into a facility (root §4.3c, SCHEMA.md §12): an
 * enrolled device asks for a short-lived, one-time code; the new device spends
 * it and gets its own credential. Both are online by nature — a device cannot
 * be trusted offline before the server has heard of it.
 */

/** As the enrolled device, for `issuedBy`, who must hold `device:enroll` (checked by the server). */
export const issueEnrollmentCode = (issuedBy: string): Promise<EnrollmentCode> => {
  const device = getDeviceCredential();
  if (!device) return Promise.reject(new ApiError('not_enrolled', 'This device is not enrolled with a facility'));
  return postAsDevice<EnrollmentCode>('/devices/codes', device.credential, { issuedBy });
};

/** Codes are read aloud and typed on a phone, so spaces and case do not matter. */
export const normalizeEnrollmentCode = (code: string): string => code.replace(/[\s-]+/g, '').toUpperCase();

/** As the joining device: the code alone decides the facility. */
export const joinFacility = (code: string, deviceId: string, deviceLabel?: string): Promise<DeviceCredential> =>
  post<DeviceCredential>('/devices', { code: normalizeEnrollmentCode(code), deviceId, deviceLabel: deviceLabel?.trim() || undefined });
