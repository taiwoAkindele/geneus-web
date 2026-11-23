//
import type { AuthorizationContext, ExistingAccountProof, StaffSession } from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { ApiError, staffRequest } from './client';

/**
 * The signed-in person's server session: opened from their PIN when they sign
 * in online, so the server itself knows who is acting on this shared device.
 * Kept for the life of this browser tab (sessionStorage), so an ordinary page
 * reload does not ask for the PIN again; closing the tab forgets it. It is only
 * ever used for the person and device it was opened for, the server still ends
 * it after its idle time and maximum lifetime, and sign-out, the app's idle
 * lock and the next person's sign-in end it here at once.
 */
type Held = StaffSession & { deviceId: string; lastUsed: number };
const TAB_KEY = 'geneus.staffSession';

const restore = (): Held | undefined => {
  try {
    const raw: unknown = JSON.parse(sessionStorage.getItem(TAB_KEY) ?? 'null');
    const h = raw as Held | null;

    return h &&
      typeof h.token === 'string' &&
      typeof h.staffId === 'string' &&
      typeof h.deviceId === 'string' &&
      typeof h.expiresOn === 'string' &&
      typeof h.idleMinutes === 'number' &&
      typeof h.lastUsed === 'number'
      ? h
      : undefined;
  } catch {
    return undefined;
  }
};

const persist = (value: Held | undefined) => {
  try {
    if (value) {
      sessionStorage.setItem(TAB_KEY, JSON.stringify(value));
    } else {
      sessionStorage.removeItem(TAB_KEY);
    }
  } catch {
    /* storage unavailable: the session lasts this page */
  }
};

let held: Held | undefined = typeof sessionStorage === 'undefined' ? undefined : restore();

const hold = (value: Held | undefined) => {
  held = value;
  persist(value);
};

export const STAFF_SESSION_EVENT = 'geneus:staffSession';

const changed = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(STAFF_SESSION_EVENT));
  }
};

const credential = () => {
  const device = getDeviceCredential();

  if (!device) {
    throw new Error('This device is not enrolled');
  }

  return device.credential;
};

export const staffSessionToken = (
  context: Pick<AuthorizationContext, 'userId' | 'deviceId'>,
): string | undefined => {
  if (!held || held.staffId !== context.userId || held.deviceId !== context.deviceId) {
    return undefined;
  }

  const now = Date.now();

  if (Date.parse(held.expiresOn) <= now || now - held.lastUsed > held.idleMinutes * 60_000) {
    hold(undefined);
    changed();

    return undefined;
  }

  return held.token;
};

export const staffSessionExpires = (context: Pick<AuthorizationContext, 'userId' | 'deviceId'>) =>
  staffSessionToken(context) ? held!.expiresOn : undefined;

export const touchStaffSession = () => {
  if (held) {
    hold({ ...held, lastUsed: Date.now() });
  }
};

const keep = (session: StaffSession, deviceId: string) => {
  hold({ ...session, deviceId, lastUsed: Date.now() });
  changed();

  return session;
};

/**
 * Holds a session the server opened for this person on another of this
 * device's facility workspaces, as a facility switch does, before the page
 * reloads into that workspace.
 */
export const adoptStaffSession = (session: StaffSession, deviceId: string): void => {
  keep(session, deviceId);
};

/** Proves the PIN to the server. Refusals: wrong_pin, locked, pin_not_enrolled, unknown_staff. */
export const openStaffSession = async (
  context: Pick<AuthorizationContext, 'userId' | 'deviceId'>,
  pin: string,
) =>
  keep(
    await staffRequest<StaffSession>('/staff/session', credential(), undefined, {
      staffId: context.userId,
      pin,
    }),
    context.deviceId,
  );

/**
 * What proves the person when their PIN is registered: the permission from
 * signing in with their password here; an administrator's PIN code or an
 * emailed invitation code (which also settles their password); or a code to
 * their own email.
 */
export type PinEnrolmentProof =
  | { pinGrant: string }
  | { setupCode: string; password?: string; existingAccount?: ExistingAccountProof }
  | { emailCode: string };

/** Registers the person's PIN with the server for this device. */
export const enrolStaffPin = async (
  staffId: string,
  deviceId: string,
  pin: string,
  proof: PinEnrolmentProof,
) =>
  keep(
    await staffRequest<StaffSession>('/staff/session/enrol', credential(), undefined, {
      staffId,
      pin,
      ...proof,
    }),
    deviceId,
  );

/** Ends the session on the server and here. Safe to call when there is none. */
export const endStaffSession = async () => {
  const ending = held;
  hold(undefined);
  changed();

  if (ending) {
    // Best effort: the session is already cleared on this device, and the server expires it anyway.
    await staffRequest('/staff/session/end', credential(), ending.token).catch(() => undefined);
  }
};

export const forgetStaffSession = () => {
  hold(undefined);
  changed();
};

/**
 * A PIN setup code just used on this device, kept briefly so the new PIN can be
 * registered with the server. `online`: an emailed invitation code, which the
 * server must accept before the PIN is saved here at all.
 */
const pendingCodes = new Map<string, { code: string; until: number; online: boolean }>();

export const rememberSetupCode = (staffId: string, code: string, online = false) =>
  pendingCodes.set(staffId, { code, until: Date.now() + 30 * 60_000, online });

export const takeSetupCode = (staffId: string) => {
  const entry = pendingCodes.get(staffId);
  pendingCodes.delete(staffId);

  return entry && entry.until > Date.now() ? entry.code : undefined;
};

/**
 * The permission a password sign-in gave to register this person's PIN on this
 * device, kept in memory until the PIN is chosen. It expires on the server too.
 */
const pinGrants = new Map<string, { grant: string; until: number }>();

export const rememberPinGrant = (staffId: string, grant: string, expiresOn: string) =>
  pinGrants.set(staffId, { grant, until: Date.parse(expiresOn) });

/** The waiting grant, without using it up: the server spends it only when the PIN is accepted. */
export const pendingPinGrant = (staffId: string): string | undefined => {
  const entry = pinGrants.get(staffId);

  return entry && entry.until > Date.now() ? entry.grant : undefined;
};

export const forgetPinGrant = (staffId: string) => pinGrants.delete(staffId);

/**
 * How accepting an invitation settles the person's password: a first one they
 * chose, or proof they own the one their email already has. Held in memory
 * until the PIN is chosen, and sent with the invitation code.
 */
export type InvitationAccount = { password: string } | { existingAccount: ExistingAccountProof };

const invitationAccounts = new Map<string, InvitationAccount>();

export const rememberInvitationAccount = (staffId: string, account: InvitationAccount) =>
  invitationAccounts.set(staffId, account);

export const pendingInvitationAccount = (staffId: string): InvitationAccount | undefined =>
  invitationAccounts.get(staffId);

export const forgetInvitationAccount = (staffId: string) => invitationAccounts.delete(staffId);

/** The invitation code waiting to be accepted online for this person, without using it up. */
export const pendingInvitationCode = (staffId: string): string | undefined => {
  const entry = pendingCodes.get(staffId);

  return entry?.online && entry.until > Date.now() ? entry.code : undefined;
};

/** Signs the person in with the server too, when online. Never blocks or fails the local sign-in. */
export const openStaffSessionQuietly = async (
  context: Pick<AuthorizationContext, 'userId' | 'deviceId'>,
  pin: string,
): Promise<'open' | 'not_enrolled' | 'offline' | 'refused'> => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return 'offline';
  }

  try {
    await openStaffSession(context, pin);

    return 'open';
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'pin_not_enrolled') {
      return 'not_enrolled';
    }

    if (cause instanceof ApiError && cause.code === 'offline') {
      return 'offline';
    }

    return 'refused';
  }
};
