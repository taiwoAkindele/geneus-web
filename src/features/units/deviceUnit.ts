/**
 * The unit this device usually sits in — a per-device convenience, so the
 * queue and "send from" open on the right room. Not a secret and not a rule:
 * staff move between rooms and any of them may act anywhere (PRD §9.7).
 * Storage can be unavailable (private mode); the app then simply asks again.
 */
const KEY = 'geneus.deviceUnit';

export const readDeviceUnit = (): string | undefined => {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
};

export const rememberDeviceUnit = (unitId: string): void => {
  try {
    localStorage.setItem(KEY, unitId);
  } catch {
    // Not remembered; the choice is asked for again next time.
  }
};
