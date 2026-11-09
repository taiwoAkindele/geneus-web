import type { AuthorizationContext } from '@shared';
const key = (context: Pick<AuthorizationContext, 'facilityId' | 'deviceId'>) => `geneus.pharmacySupport:${context.facilityId}:${context.deviceId}`;
export const pharmacySupported = (context: Pick<AuthorizationContext, 'facilityId' | 'deviceId'>) => typeof localStorage !== 'undefined' && localStorage.getItem(key(context)) === '1';
export const rememberPharmacySupport = (context: Pick<AuthorizationContext, 'facilityId' | 'deviceId'>, version?: 1) => {
  if (typeof localStorage === 'undefined') return;
  if (version === 1) localStorage.setItem(key(context), '1'); else localStorage.removeItem(key(context));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('geneus:pharmacySupport'));
};
