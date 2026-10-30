import { z } from 'zod';
import type { RosterShift, Staff } from '@shared';
import { secureGet, secureRemove, secureSet } from '@/lib/secureStorage';
import { maySignIn, SESSION_IDLE_MS } from './accessPolicy';
import { isFrozen } from './signInChecks';

const KEY = 'geneus.facilitySwitchIdentity';
const Identity = z.object({ sourceStaffId: z.string().min(1), facilityId: z.string().min(1), deviceId: z.string().min(1), staffId: z.string().min(1), personId: z.string().min(1), createdOn: z.number().finite() });
export type FacilitySwitchIdentity = z.infer<typeof Identity>;
export const pendingFacilityIdentity = () => {
  const raw = secureGet(KEY);
  return raw ? Identity.parse(JSON.parse(raw)) : undefined;
};
export const saveFacilityIdentity = (identity: FacilitySwitchIdentity) => secureSet(KEY, JSON.stringify(Identity.parse(identity)));
export const clearFacilityIdentity = () => secureRemove(KEY);

export const assertSourceSession = (identity: FacilitySwitchIdentity, now = Date.now()) => {
  const lastActivity = Number(localStorage.getItem('geneus.lastActivityOn'));
  if (localStorage.getItem('geneus.signedInStaffId') !== identity.sourceStaffId || !Number.isFinite(lastActivity) || lastActivity <= 0 || now < lastActivity || now - lastActivity >= SESSION_IDLE_MS) {
    throw new Error('Sign in again before switching with this account');
  }
};

/** Role, sign-in hours and membership always come from the destination facility. */
export const canContinueFacilitySession = (identity: FacilitySwitchIdentity, target: {
  facilityId: string; deviceId: string; staff: Staff; shift: RosterShift | undefined; lastServerContact: string | undefined;
}, now = Date.now()) => target.facilityId === identity.facilityId && target.deviceId === identity.deviceId &&
  target.staff.facilityId === identity.facilityId && target.staff.staffId === identity.staffId && target.staff.personId === identity.personId &&
  target.staff.active && now >= identity.createdOn && now - identity.createdOn < 5 * 60_000 &&
  !isFrozen(target.lastServerContact, now) && maySignIn({ staff: target.staff, shift: target.shift }, now);

/** Reuse only this person's PIN when first setting up their separately provisioned membership. */
export const reuseAccountPin = (sourceRaw: string | undefined, targetRaw: string | undefined, sourceStaffId: string, targetStaffId: string) => {
  const source = sourceRaw ? JSON.parse(sourceRaw) as Record<string, unknown> : {};
  const target = targetRaw ? JSON.parse(targetRaw) as Record<string, unknown> : {};
  if (!target[targetStaffId] && source[sourceStaffId]) target[targetStaffId] = source[sourceStaffId];
  return JSON.stringify(target);
};

/** A PIN reset approved at A must never authenticate or replace a different PIN at B. */
export const sharesAccountPin = (sourceRaw: string | undefined, targetRaw: string | undefined, sourceStaffId: string, targetStaffId: string, now = Date.now()) => {
  type Pin = { salt?: string; hash?: string; iterations?: number; digits?: number; lockedUntil?: number };
  const source = sourceRaw ? (JSON.parse(sourceRaw) as Record<string, Pin>)[sourceStaffId] : undefined;
  const target = targetRaw ? (JSON.parse(targetRaw) as Record<string, Pin>)[targetStaffId] : undefined;
  return Boolean(source?.salt && source.hash && source.iterations && source.digits === 6 && target?.digits === 6 &&
    source.salt === target.salt && source.hash === target.hash && source.iterations === target.iterations &&
    (source.lockedUntil ?? 0) <= now && (target.lockedUntil ?? 0) <= now);
};
