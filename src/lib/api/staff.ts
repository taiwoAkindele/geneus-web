import type {
  AuthorizationContext,
  DeviceCredential,
  EmailSent,
  InvitationCheckResult,
} from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { ApiError, post, postAsDevice, staffRequest } from './client';
import { VerificationRequired } from './insurance';
import { forgetStaffSession, staffSessionToken, touchStaffSession } from './staffSession';

/** Every call here is made as the enrolled device; the server decides the facility from its credential. */
const deviceCredential = (): string => {
  const device = getDeviceCredential();

  if (!device) {
    throw new ApiError('not_enrolled', 'This device is not enrolled with a facility');
  }

  return device.credential;
};

const asDevice = <T>(path: string, body?: unknown): Promise<T> => {
  try {
    return postAsDevice<T>(path, deviceCredential(), body);
  } catch (cause) {
    return Promise.reject(cause);
  }
};

/**
 * A call the server accepts only from the person as it has proven them: their
 * PIN-proven session, never just the id this device says is signed in. When
 * the session has ended, `VerificationRequired` asks the screen for the PIN.
 */
const asProvenPerson = async <T>(
  context: AuthorizationContext,
  path: string,
  body: unknown,
): Promise<T> => {
  try {
    const result = await staffRequest<T>(
      path,
      deviceCredential(),
      staffSessionToken(context),
      body,
    );

    touchStaffSession();

    return result;
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'staff_session_required') {
      forgetStaffSession();
      throw new VerificationRequired();
    }

    throw cause;
  }
};

const staffPath = (staffId: string, rest: string) =>
  `/staff/${encodeURIComponent(staffId)}/${rest}`;

/** Step one of a facility admin setting their own recovery email: codes go to the new address (and the current one). */
export const requestRecoveryEmailCode = (
  context: AuthorizationContext,
  email: string,
): Promise<EmailSent> =>
  asProvenPerson<EmailSent>(context, staffPath(context.userId, 'email/code'), {
    email,
    requestedBy: context.userId,
  });

export const confirmRecoveryEmail = (
  context: AuthorizationContext,
  email: string,
  code: string,
  currentCode?: string,
): Promise<void> =>
  asProvenPerson<void>(context, staffPath(context.userId, 'email'), {
    email,
    code,
    currentCode,
    requestedBy: context.userId,
  });

/* ---------------- Invitations (server-only state; these shapes are the server's answers) ---------------- */

export type InvitationStatus = 'pending' | 'expired' | 'locked' | 'accepted' | 'revoked';

/** `provider_accepted`: the email provider took it — not proof it arrived. `not_configured`: a development server only logged it. */
export type InvitationDelivery =
  'sending' | 'provider_accepted' | 'provider_rejected' | 'not_configured';

export type InvitationView = {
  id: string;
  channel: 'email';
  destination: string;
  status: InvitationStatus;
  delivery: InvitationDelivery;
  createdOn: string;
  expiresOn: string;
  acceptedOn?: string;
  revokedOn?: string;
  revokedReason?: 'resent' | 'revoked' | 'pin_code_issued';
  /** The link may set up one new device, as an administrator who may add devices chose. */
  allowsNewDevice: boolean;
};

export type ContactActivation = {
  email?: { address: string; verified: true };
  invitation?: InvitationView;
  activation: { serverPinDevices: number; lastPinRegisteredOn?: string };
  /** Whether their email has a Geneus password, for new devices and a forgotten PIN. */
  password: 'set' | 'not_set';
  nextSendAllowedOn?: string;
};

export type StaffOnboardingSummary = {
  staffId: string;
  activated: boolean;
  hasEmail: boolean;
  passwordSet: boolean;
  invitation?: { status: InvitationStatus; delivery: InvitationDelivery; expiresOn: string };
};

/**
 * Emails `staffId` an invitation link to choose their password and PIN.
 * Without `email`, it goes to their verified address, which administrators see
 * only masked. `allowNewDevice` lets the link set up one device that is not yet
 * enrolled; the server allows it only for someone who may add devices. The
 * answer never contains the link or the code: only their recipient sees them.
 */
export const sendStaffInvitation = (
  context: AuthorizationContext,
  staffId: string,
  email?: string,
  allowNewDevice = false,
): Promise<{ invitation: InvitationView }> =>
  asProvenPerson(context, staffPath(staffId, 'invitations'), {
    channel: 'email',
    ...(email ? { email } : {}),
    ...(allowNewDevice ? { allowNewDevice: true } : {}),
  });

export const revokeStaffInvitation = (
  context: AuthorizationContext,
  staffId: string,
): Promise<{ revoked: true }> =>
  asProvenPerson(context, staffPath(staffId, 'invitations/revoke'), {});

export const staffContactActivation = (
  context: AuthorizationContext,
  staffId: string,
): Promise<ContactActivation> =>
  asProvenPerson(context, staffPath(staffId, 'contact-activation'), {});

export const staffOnboardingSummaries = (
  context: AuthorizationContext,
): Promise<{ staff: StaffOnboardingSummary[] }> =>
  asProvenPerson(context, '/staff/invitations/list', {});

/**
 * Whether `code` is this person's invitation code, before they choose a PIN.
 * The person has no PIN yet, so only the device signs the call. Spends nothing.
 */
export const checkInvitationCode = (
  staffId: string,
  code: string,
): Promise<InvitationCheckResult> =>
  asDevice<InvitationCheckResult>(staffPath(staffId, 'invitations/check'), { code });

/**
 * For an invited email that already has a password: emails a code proving the
 * person accepting owns it, instead of typing that password. Spends nothing.
 */
export const requestInvitationAccountCode = (staffId: string, code: string) =>
  asDevice<EmailSent>(staffPath(staffId, 'invitations/account-code'), { code });

/* ---------------- Invitation links: opened by the person invited ---------------- */

/** Who an invitation link is for and what it can still do. Never a code. */
export type InvitationLinkView = {
  staffId: string;
  staffName: string;
  role: string;
  facilityId: string;
  facilityName: string;
  expiresOn: string;
  status: InvitationStatus;
  newDevice: 'allowed' | 'used' | 'not_allowed';
};

/** Reads a link without spending anything. Needs no device credential: the device may not be enrolled yet. */
export const openInvitationLink = (token: string): Promise<InvitationLinkView> =>
  post<InvitationLinkView>('/invitations/link/open', { token });

/** Enrols this (unenrolled) device from the link, when its invitation allows one new device. */
export const enrolDeviceFromInvitation = (
  token: string,
  deviceId: string,
  deviceLabel: string,
): Promise<DeviceCredential> =>
  post<DeviceCredential>('/invitations/link/device', {
    token,
    deviceId,
    deviceLabel: deviceLabel.trim(),
  });

/** As a device enrolled at the invitation's facility: a fresh one-time code that accepts the invitation. */
export const invitationLinkCode = (token: string): Promise<{ staffId: string; code: string }> =>
  asDevice<{ staffId: string; code: string }>('/invitations/link/code', { token });

/** Whether an invitation needs the administrator to do something: send again, or check the address. */
export const invitationNeedsAttention = (invitation: {
  status: InvitationStatus;
  delivery: InvitationDelivery;
}): boolean =>
  invitation.status === 'expired' ||
  invitation.status === 'locked' ||
  (invitation.status === 'pending' && invitation.delivery === 'provider_rejected');
