import type {
  AuthorizationContext,
  DevicePasswordChallenge,
  DevicePasswordSignInResult,
  EmailSent,
  StaffPasswordSession,
} from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { post, postAsDevice, staffRequest } from './client';
import { adoptStaffSession, rememberPinGrant, staffSessionToken } from './staffSession';

/**
 * Staff passwords (SCHEMA.md §10). A password proves who someone is on a new
 * device, after too many wrong PINs, or when they forgot their PIN; the PIN
 * stays the everyday unlock. Every successful sign-in also hands back
 * permission to choose this device's PIN, held until the PIN is chosen.
 */

const enrolledDevice = () => {
  const device = getDeviceCredential();

  if (!device) {
    throw new Error('This device is not set up for a facility');
  }

  return device;
};

const deviceCredential = (): string => enrolledDevice().credential;

/** Keeps the server session and the PIN permission a password sign-in returned. */
const holdPasswordSession = (session: StaffPasswordSession, deviceId: string) => {
  adoptStaffSession(session, deviceId);
  rememberPinGrant(session.staffId, session.pinGrant, session.pinGrantExpiresOn);

  return session;
};

/** On a device already set up for a facility. */
export const signInWithPassword = async (
  email: string,
  password: string,
): Promise<StaffPasswordSession> => {
  const device = enrolledDevice();

  const session = await postAsDevice<StaffPasswordSession>(
    '/staff/password/sign-in',
    device.credential,
    { email, password },
  );

  return holdPasswordSession(session, device.deviceId);
};

/** On a device set up nowhere: the right password emails a code for this device. */
export const beginNewDeviceSignIn = (email: string, password: string, deviceId: string) =>
  post<DevicePasswordChallenge>('/devices/password-sign-in', { email, password, deviceId });

/**
 * The emailed code enrols this device at the person's primary facility. The
 * caller saves the device credential; the session and PIN permission are held here.
 */
export const confirmNewDeviceSignIn = async (
  email: string,
  deviceId: string,
  code: string,
  deviceLabel?: string,
): Promise<DevicePasswordSignInResult> => {
  const result = await post<DevicePasswordSignInResult>('/devices/password-sign-in/confirm', {
    email,
    deviceId,
    code,
    ...(deviceLabel?.trim() ? { deviceLabel: deviceLabel.trim() } : {}),
  });

  holdPasswordSession(result.session, result.device.deviceId);

  return result;
};

/** Emails a reset code. The answer is the same whether or not the email is known. */
export const requestPasswordReset = (email: string) =>
  postAsDevice<Pick<EmailSent, 'sentTo'>>('/staff/password/reset/request', deviceCredential(), {
    email,
  });

export const resetPassword = (email: string, code: string, password: string) =>
  postAsDevice<void>('/staff/password/reset', deviceCredential(), { email, code, password });

/** Needs the signed-in person's server session; the current password proves it is them. */
export const changePassword = (
  context: Pick<AuthorizationContext, 'userId' | 'deviceId'>,
  currentPassword: string,
  password: string,
) =>
  staffRequest<void>('/staff/password/change', deviceCredential(), staffSessionToken(context), {
    currentPassword,
    password,
  });

/* ---------------- A first password, for staff who signed in before passwords ---------------- */

export type OwnPasswordStatus = { email: string | null; hasPassword: boolean };

type SignedIn = Pick<AuthorizationContext, 'userId' | 'deviceId'>;

const asSignedIn = <T>(context: SignedIn, path: string, body: unknown = {}) =>
  staffRequest<T>(path, deviceCredential(), staffSessionToken(context), body);

/** Whether the signed-in person has a password yet, and the email it would belong to (masked). */
export const ownPasswordStatus = (context: SignedIn) =>
  asSignedIn<OwnPasswordStatus>(context, '/staff/me/password/status');

/** Emails the signed-in person a code for choosing their first password. */
export const requestFirstPasswordCode = (context: SignedIn) =>
  asSignedIn<Pick<EmailSent, 'sentTo' | 'expiresOn'>>(context, '/staff/me/password/code');

/** Never replaces a password: the server refuses when one exists. */
export const setFirstPassword = (context: SignedIn, code: string, password: string) =>
  asSignedIn<void>(context, '/staff/me/password', { code, password });
