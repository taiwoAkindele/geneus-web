import { activeWorkspace } from './facilityWorkspaces';
import { useEffect, useState } from 'react';
type Scope = { facilityId: string; deviceId: string };
const key = (s: Scope) => `geneus.billingCatalogue:${s.facilityId}:${s.deviceId}`;
export const billingCatalogueEnabled = (scope: Scope | undefined = activeWorkspace()) =>
  Boolean(scope && typeof localStorage !== 'undefined' && localStorage.getItem(key(scope)) === '1');
export const rememberBillingCatalogue = (scope: Scope, enabled?: boolean) => {
  if (typeof localStorage === 'undefined') {
    return;
  }
  if (enabled) {
    localStorage.setItem(key(scope), '1');
  } else {
    localStorage.removeItem(key(scope));
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('geneus:billingCatalogue'));
  }
};
export const useBillingCatalogue = (scope: Scope) => {
  const [enabled, setEnabled] = useState(() => billingCatalogueEnabled(scope));
  useEffect(() => {
    const refresh = () => setEnabled(billingCatalogueEnabled(scope));
    window.addEventListener('geneus:billingCatalogue', refresh);
    refresh();
    return () => window.removeEventListener('geneus:billingCatalogue', refresh);
  }, [scope.facilityId, scope.deviceId]);
  return enabled;
};
