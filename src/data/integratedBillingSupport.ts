import { activeWorkspace } from './facilityWorkspaces';
import { useEffect, useState } from 'react';

type Scope = { facilityId: string; deviceId: string };
const key = (s: Scope) => `geneus.integratedBilling:${s.facilityId}:${s.deviceId}`;

export const integratedBillingEnabled = (scope: Scope | undefined = activeWorkspace()) =>
  Boolean(scope && typeof localStorage !== 'undefined' && localStorage.getItem(key(scope)) === '1');

export const rememberIntegratedBilling = (scope: Scope, enabled?: boolean) => {
  if (typeof localStorage === 'undefined') {
    return;
  }

  if (enabled) {
    localStorage.setItem(key(scope), '1');
  } else {
    localStorage.removeItem(key(scope));
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('geneus:integratedBilling'));
  }
};

export const useIntegratedBilling = (scope: Scope) => {
  const [enabled, setEnabled] = useState(() => integratedBillingEnabled(scope));
  useEffect(() => {
    const refresh = () => setEnabled(integratedBillingEnabled(scope));
    window.addEventListener('geneus:integratedBilling', refresh);
    refresh();

    return () => window.removeEventListener('geneus:integratedBilling', refresh);
  }, [scope.facilityId, scope.deviceId]);

  return enabled;
};
