import { inBillingPeriod, type AuthorizationContext, type InsuranceBillingPeriod } from '@shared';

/**
 * What the server granted this device for insurance, remembered from the
 * sync token. `setup` shows insurance configuration and lets cover be recorded,
 * but never changes a bill; `active` also applies cover to charges raised from
 * activation; `history` means billing was turned off but charges raised while
 * it was on keep their insurance treatment. Nothing is granted until the
 * hospital enters setup, so insurance stays hidden until then.
 */
export type DeviceInsurance = 'setup' | 'active' | 'history';
type Stored = { state: DeviceInsurance; periods: InsuranceBillingPeriod[] };
const key = (context: Pick<AuthorizationContext, 'facilityId' | 'deviceId'>) => `geneus.insuranceSupport:${context.facilityId}:${context.deviceId}`;
export const INSURANCE_SUPPORT_EVENT = 'geneus:insuranceSupport';

const read = (context: Partial<Pick<AuthorizationContext, 'facilityId' | 'deviceId'>>): Stored | undefined => {
  if (!context.facilityId || !context.deviceId) return undefined;
  try {
    const value = typeof localStorage !== 'undefined' ? localStorage.getItem(key(context as Pick<AuthorizationContext, 'facilityId' | 'deviceId'>)) : null;
    if (!value) return undefined;
    // Earlier versions stored '1' (billing on) or a bare state, without periods: they keep working until the next token.
    if (value === '1' || value === 'active') return { state: 'active', periods: [{ from: '1970-01-01T00:00:00.000Z' }] };
    if (value === 'setup') return { state: 'setup', periods: [] };
    const parsed = JSON.parse(value) as Stored;
    return ['setup', 'active', 'history'].includes(parsed.state) && Array.isArray(parsed.periods) ? parsed : undefined;
  } catch { return undefined; }
};

export const deviceInsurance = (context: Partial<Pick<AuthorizationContext, 'facilityId' | 'deviceId'>>): DeviceInsurance | undefined => read(context)?.state;
export const insuranceSupported = (context: Partial<Pick<AuthorizationContext, 'facilityId' | 'deviceId'>>): boolean => read(context) !== undefined;
export const insuranceBillingActive = (context: Partial<Pick<AuthorizationContext, 'facilityId' | 'deviceId'>>): boolean => read(context)?.state === 'active';
/** Insurance billing work exists: billing is on now, or was on before. */
export const insuranceBillingWork = (context: Partial<Pick<AuthorizationContext, 'facilityId' | 'deviceId'>>): boolean => { const s = read(context)?.state; return s === 'active' || s === 'history'; };
export const insuranceBillingPeriods = (context: Partial<Pick<AuthorizationContext, 'facilityId' | 'deviceId'>>): InsuranceBillingPeriod[] => read(context)?.periods ?? [];
export const chargeInBillingPeriod = (createdOn: string, periods: readonly InsuranceBillingPeriod[]) => inBillingPeriod(createdOn, periods);

export const rememberInsuranceSupport = (context: Pick<AuthorizationContext, 'facilityId' | 'deviceId'>, version?: 1, billingActive?: boolean, periods?: readonly InsuranceBillingPeriod[]) => {
  try {
    if (typeof localStorage === 'undefined') return;
    if (version === 1) {
      const known = periods ? [...periods] : (billingActive === false ? [] : [{ from: '1970-01-01T00:00:00.000Z' }]);
      const state: DeviceInsurance = billingActive === false ? (known.length ? 'history' : 'setup') : 'active';
      localStorage.setItem(key(context), JSON.stringify({ state, periods: known } satisfies Stored));
    } else localStorage.removeItem(key(context));
  } catch { /* storage unavailable: insurance stays hidden */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(INSURANCE_SUPPORT_EVENT));
};
