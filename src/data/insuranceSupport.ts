import type { AuthorizationContext } from '@shared';

/**
 * Whether the server granted this device the insurance workflow. It is granted
 * only after an operator enables insurance for the hospital, so every insurance
 * screen, prompt and balance change stays hidden until then (PRODUCT.md §7.10).
 */
const key = (context: Pick<AuthorizationContext, 'facilityId' | 'deviceId'>) => `geneus.insuranceSupport:${context.facilityId}:${context.deviceId}`;
export const INSURANCE_SUPPORT_EVENT = 'geneus:insuranceSupport';

export const insuranceSupported = (context: Partial<Pick<AuthorizationContext, 'facilityId' | 'deviceId'>>): boolean => {
  if (!context.facilityId || !context.deviceId) return false;
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(key(context as Pick<AuthorizationContext, 'facilityId' | 'deviceId'>)) === '1'; }
  catch { return false; }
};

export const rememberInsuranceSupport = (context: Pick<AuthorizationContext, 'facilityId' | 'deviceId'>, version?: 1) => {
  try {
    if (typeof localStorage === 'undefined') return;
    if (version === 1) localStorage.setItem(key(context), '1'); else localStorage.removeItem(key(context));
  } catch { /* storage unavailable: insurance stays hidden */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(INSURANCE_SUPPORT_EVENT));
};
