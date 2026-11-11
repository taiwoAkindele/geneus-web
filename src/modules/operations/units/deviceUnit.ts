import { getDeviceCredential } from '@/data/deviceCredential';
import { activeWorkspace } from '@/data/facilityWorkspaces';
/**
 * The unit this device usually sits in — a per-device convenience, so the
 * queue and "send from" open on the right room. Not a secret and not a rule:
 * staff move between rooms and any of them may act anywhere (PRD §9.7).
 * Storage can be unavailable (private mode); the app then simply asks again.
 */
const BASE_KEY = 'geneus.deviceUnit';

export const readDeviceUnit = (): string | undefined => {
  try {
    return (localStorage.getItem(getDeviceCredential() ? BASE_KEY + ':' + getDeviceCredential()!.facilityId : BASE_KEY) ?? (activeWorkspace()?.legacy ? localStorage.getItem(BASE_KEY) : null)) ?? undefined;
  } catch {
    return undefined;
  }
};

export const rememberDeviceUnit = (unitId: string): void => {
  try {
    localStorage.setItem(getDeviceCredential() ? BASE_KEY + ':' + getDeviceCredential()!.facilityId : BASE_KEY, unitId);
  } catch {
    // Not remembered; the choice is asked for again next time.
  }
};
