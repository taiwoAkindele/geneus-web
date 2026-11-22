import type {
  AuthorizationContext,
  FacilityDetailsUpdate,
  OwnEmailStatus,
  StaffEmailRequestView,
} from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { ApiError, staffRequest } from './client';
import { forgetStaffSession, staffSessionToken, touchStaffSession } from './staffSession';
import { VerificationRequired } from './insurance';

/**
 * Hospital self-service administration. Calls that change something
 * consequential carry the person's verified email session; reads and the
 * first step of proving an address need only the enrolled device.
 */
const credential = () => {
  const device = getDeviceCredential();

  if (!device) {
    throw new Error('This device is not enrolled');
  }

  return device.credential;
};

const send = async <T>(
  context: AuthorizationContext,
  path: string,
  body: unknown,
  needsVerification: boolean,
): Promise<T> => {
  const token = staffSessionToken(context);
  void needsVerification; // The server checks who is acting and what they may do; no separate PIN step.

  try {
    const result = await staffRequest<T>(path, credential(), token, body, context.userId);
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

export type TimeZoneChange = { from?: string; to: string; reason?: string; by: string; on: string };

export const timeZoneHistory = (context: AuthorizationContext) =>
  send<{ changes: TimeZoneChange[] }>(context, '/facility/time-zone/history', {}, false);

export const saveTimeZone = (context: AuthorizationContext, timeZone: string, reason?: string) =>
  send<{ timeZone: string; changed: boolean }>(
    context,
    '/facility/time-zone',
    { timeZone, confirm: true, ...(reason?.trim() ? { reason: reason.trim() } : {}) },
    true,
  );

/** A facility administrator corrects the hospital's details; the code is never sent and never changes. */
export const saveFacilityDetails = (
  context: AuthorizationContext,
  details: FacilityDetailsUpdate,
) => send<{ changed: string[] }>(context, '/facility/details', details, true);

export const ownEmailStatus = (context: AuthorizationContext) =>
  send<OwnEmailStatus>(context, '/staff/me/email/status', { staffId: context.userId }, false);

export const requestOwnEmailCode = (context: AuthorizationContext, email: string) =>
  send<{ sentTo: string; expiresOn: string }>(
    context,
    '/staff/me/email/code',
    { staffId: context.userId, email },
    false,
  );

export const confirmOwnEmail = (context: AuthorizationContext, email: string, code: string) =>
  send<{ status: 'verified' }>(
    context,
    '/staff/me/email',
    { staffId: context.userId, email, code },
    false,
  );

export const listEmailRequests = (context: AuthorizationContext) =>
  send<{ requests: StaffEmailRequestView[] }>(context, '/staff/email-requests/list', {}, true);

export const decideEmailRequest = (
  context: AuthorizationContext,
  id: string,
  decision: 'approve' | 'reject',
  note?: string,
) =>
  send<{ ok: true }>(
    context,
    `/staff/email-requests/${encodeURIComponent(id)}/decide`,
    { decision, ...(note?.trim() ? { note: note.trim() } : {}) },
    true,
  );

export type DeviceStatus = {
  id: string;
  label?: string;
  status: string;
  enrolledOn: string;
  revokedOn?: string;
  lastSeenOn?: string;
  insuranceCapable: boolean;
  pendingChanges?: number;
  lastReportedOn?: string;
  blocking: string[];
  thisDevice: boolean;
};

export const deviceStatus = (context: AuthorizationContext) =>
  send<{ devices: DeviceStatus[] }>(
    context,
    '/devices/status',
    { requestedBy: context.userId },
    false,
  );
