import { registerWorkspaceFlusher } from '@/data/facilityWorkspaces';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useAuthorizationContext } from '@/session';
import { createRegistrationRecovery } from './registrationRecovery';
import { EMPTY_REGISTRATION, type RegistrationNavState, type RegistrationValues } from './registrationValues';

const DraftContext = createContext<ReturnType<typeof createRegistrationRecovery> | null>(null);
const DraftProvider = ({ children }: { children: ReactNode }) => {
  const owner = useAuthorizationContext();
  const [recovery] = useState(() => createRegistrationRecovery(owner));
  useEffect(() => registerWorkspaceFlusher(recovery.flush), [recovery]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const status = recovery.status();
      if (status.pending || (status.error && !status.unreadable)) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recovery]);
  return <DraftContext.Provider value={recovery}>{children}</DraftContext.Provider>;
};

/** Each staff, facility and device enrollment has a separate private draft scope. */
export const RegistrationDraftProvider = ({ children }: { children: ReactNode }) => {
  const { facilityId, deviceId, userId } = useAuthorizationContext();
  return <DraftProvider key={JSON.stringify([facilityId, deviceId, userId])}>{children}</DraftProvider>;
};

export const useRegistrationRecovery = () => {
  const recovery = useContext(DraftContext);
  if (!recovery) throw new Error('RegistrationDraftProvider is required');
  const status = useSyncExternalStore(recovery.subscribe, recovery.status);
  return { recovery, status };
};

export const useRegistrationDraft = (state: RegistrationNavState = {}) => {
  const { recovery, status } = useRegistrationRecovery();
  const store = recovery.store;
  const key = state?.patientId ?? 'new';
  const initial = useRef(store.read(key));
  const keep = useCallback((partial: Partial<RegistrationValues>) => {
    const next = { ...store.read(key, initial.current), ...partial };
    store.keep(key, next);
  }, [store, key]);
  const clear = useCallback(() => recovery.clear(key), [recovery, key]);
  return { values: initial.current, keep, clear, status, retry: recovery.retry };
};

/** Seed private edits; browser history contains only the saved patient's ID. */
export const useBeginRegistration = () => {
  const { recovery } = useRegistrationRecovery();
  return (patientId: string, values: RegistrationValues) => {
    if (!recovery.store.peek(patientId)) recovery.store.keep(patientId, { ...EMPTY_REGISTRATION, ...values });
  };
};

export const useClearRegistrationDraft = () => {
  const { recovery } = useRegistrationRecovery();
  return (key = 'new') => recovery.clear(key);
};
