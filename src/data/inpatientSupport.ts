import type { AuthorizationContext } from '@shared';
const key = (context: Pick<AuthorizationContext, 'facilityId' | 'deviceId'>) => `geneus.inpatientSupport:${context.facilityId}:${context.deviceId}`;
/** Non-secret compatibility flag, scoped to the enrolled hospital/device. */
export const inpatientSupported = (context: Pick<AuthorizationContext, 'facilityId' | 'deviceId'>) => typeof localStorage !== 'undefined' && localStorage.getItem(key(context)) === '1';
export const rememberInpatientSupport = (context: Pick<AuthorizationContext, 'facilityId' | 'deviceId'>, version?: 1) => {
  if (typeof localStorage === 'undefined') return;
  if (version === 1) localStorage.setItem(key(context), '1'); else localStorage.removeItem(key(context));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('geneus:inpatientSupport'));
};
