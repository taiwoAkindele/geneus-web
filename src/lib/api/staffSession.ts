import type { AuthorizationContext, StaffSession } from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { ApiError, staffRequest } from './client';

/**
 * The signed-in person's server session: opened from their PIN when they sign
 * in online, so the server itself knows who is acting on this shared device.
 * Held in memory only — a reload, sign-out or the next person's sign-in ends
 * it — and never written to storage.
 */
type Held = StaffSession & { deviceId: string; lastUsed: number };
let held: Held | undefined;
export const STAFF_SESSION_EVENT = 'geneus:staffSession';
const changed = () => { if (typeof window !== 'undefined') window.dispatchEvent(new Event(STAFF_SESSION_EVENT)); };
const credential = () => { const device = getDeviceCredential(); if (!device) throw new Error('This device is not enrolled'); return device.credential; };

export const staffSessionToken = (context: Pick<AuthorizationContext, 'userId' | 'deviceId'>): string | undefined => {
  if (!held || held.staffId !== context.userId || held.deviceId !== context.deviceId) return undefined;
  const now = Date.now();
  if (Date.parse(held.expiresOn) <= now || now - held.lastUsed > held.idleMinutes * 60_000) { held = undefined; changed(); return undefined; }
  return held.token;
};
export const staffSessionExpires = (context: Pick<AuthorizationContext, 'userId' | 'deviceId'>) => (staffSessionToken(context) ? held!.expiresOn : undefined);
export const touchStaffSession = () => { if (held) held.lastUsed = Date.now(); };
const keep = (session: StaffSession, deviceId: string) => { held = { ...session, deviceId, lastUsed: Date.now() }; changed(); return session; };

/** Proves the PIN to the server. Refusals: wrong_pin, locked, pin_not_enrolled, unknown_staff. */
export const openStaffSession = async (context: Pick<AuthorizationContext, 'userId' | 'deviceId'>, pin: string) =>
  keep(await staffRequest<StaffSession>('/staff/session', credential(), undefined, { staffId: context.userId, pin }), context.deviceId);

/** Registers the person's PIN with the server for this device, proven by an administrator's PIN code or a code to their own email. */
export const enrolStaffPin = async (staffId: string, deviceId: string, pin: string, proof: { setupCode: string } | { emailCode: string }) =>
  keep(await staffRequest<StaffSession>('/staff/session/enrol', credential(), undefined, { staffId, pin, ...proof }), deviceId);

/** Ends the session on the server and here. Safe to call when there is none. */
export const endStaffSession = async () => {
  const ending = held;
  held = undefined; changed();
  if (ending) await staffRequest('/staff/session/end', credential(), ending.token).catch(() => undefined);
};
export const forgetStaffSession = () => { held = undefined; changed(); };

/** A PIN setup code just used on this device, kept briefly so the new PIN can be registered with the server. */
const pendingCodes = new Map<string, { code: string; until: number }>();
export const rememberSetupCode = (staffId: string, code: string) => pendingCodes.set(staffId, { code, until: Date.now() + 30 * 60_000 });
export const takeSetupCode = (staffId: string) => { const entry = pendingCodes.get(staffId); pendingCodes.delete(staffId); return entry && entry.until > Date.now() ? entry.code : undefined; };

/** Signs the person in with the server too, when online. Never blocks or fails the local sign-in. */
export const openStaffSessionQuietly = async (context: Pick<AuthorizationContext, 'userId' | 'deviceId'>, pin: string): Promise<'open' | 'not_enrolled' | 'offline' | 'refused'> => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'offline';
  try { await openStaffSession(context, pin); return 'open'; }
  catch (cause) { return cause instanceof ApiError && cause.code === 'pin_not_enrolled' ? 'not_enrolled' : cause instanceof ApiError && cause.code === 'offline' ? 'offline' : 'refused'; }
};
