import type { EmailSent, PinSetupCodeIssued } from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { ApiError, postAsDevice } from './client';

/** Every call here is made as the enrolled device; the server decides the facility from its credential. */
const asDevice = <T>(path: string, body?: unknown): Promise<T> => {
  const device = getDeviceCredential();
  if (!device) return Promise.reject(new ApiError('not_enrolled', 'This device is not enrolled with a facility'));
  return postAsDevice<T>(path, device.credential, body);
};

const staffPath = (staffId: string, rest: string) => `/staff/${encodeURIComponent(staffId)}/${rest}`;

/**
 * Asks geneus-server for a one-time code that lets `staffId` set their PIN on
 * a facility device. Online only: the server checks `issuedBy` holds
 * `staff:manage` and is the only one that ever sees the plain code.
 */
export const issuePinSetupCode = (staffId: string, issuedBy: string): Promise<PinSetupCodeIssued> =>
  asDevice<PinSetupCodeIssued>(staffPath(staffId, 'pin-codes'), { issuedBy });

/** A facility admin who forgot their PIN: the server emails them a PIN setup code (SCHEMA.md §10). */
export const emailPinSetupCode = (staffId: string): Promise<EmailSent> => asDevice<EmailSent>(staffPath(staffId, 'pin-codes/email'));

/** Step one of a facility admin setting their own recovery email: codes go to the new address (and the current one). */
export const requestRecoveryEmailCode = (staffId: string, email: string): Promise<EmailSent> =>
  asDevice<EmailSent>(staffPath(staffId, 'email/code'), { email, requestedBy: staffId });

export const confirmRecoveryEmail = (staffId: string, email: string, code: string, currentCode?: string): Promise<void> =>
  asDevice<void>(staffPath(staffId, 'email'), { email, code, currentCode, requestedBy: staffId });
