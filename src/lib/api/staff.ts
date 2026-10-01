import type { PinSetupCodeIssued } from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { ApiError, postAsDevice } from './client';

/**
 * Asks geneus-server for a one-time code that lets `staffId` set their PIN on
 * a facility device. Online only: the server checks `issuedBy` holds
 * `staff:manage` and is the only one that ever sees the plain code.
 */
export const issuePinSetupCode = (staffId: string, issuedBy: string): Promise<PinSetupCodeIssued> => {
  const device = getDeviceCredential();
  if (!device) return Promise.reject(new ApiError('not_enrolled', 'This device is not enrolled with a facility'));
  return postAsDevice<PinSetupCodeIssued>(`/staff/${encodeURIComponent(staffId)}/pin-codes`, device.credential, { issuedBy });
};
