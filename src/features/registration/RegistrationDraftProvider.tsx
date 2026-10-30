import { secureGet, secureSet } from '@/lib/secureStorage';
import { registerWorkspaceFlusher } from '@/data/facilityWorkspaces';
import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useAuthorizationContext } from '@/session';
import { createRegistrationDraft, type RegistrationDraftSnapshot } from './registrationDraft';
import { EMPTY_REGISTRATION, type RegistrationNavState, type RegistrationValues } from './registrationValues';

const DraftContext = createContext<ReturnType<typeof createRegistrationDraft> | null>(null);
const DraftProvider = ({ children }: { children: ReactNode }) => {
  const { userId } = useAuthorizationContext();
  const pending = useRef<Promise<void>>(Promise.resolve());
  const cached: Record<string, RegistrationDraftSnapshot> = JSON.parse(secureGet('geneus.registrationDrafts') ?? '{}');
  const store = useRef(createRegistrationDraft((draft) => {
    const next = JSON.parse(secureGet('geneus.registrationDrafts') ?? '{}');
    if (draft) next[userId] = draft; else delete next[userId];
    pending.current = secureSet('geneus.registrationDrafts', JSON.stringify(next));
    void pending.current.catch(() => {});
  }, cached[userId]));
  useEffect(() => registerWorkspaceFlusher(() => pending.current), []);
  return <DraftContext.Provider value={store.current}>{children}</DraftContext.Provider>;
};

/** Remount on staff handover, clearing every unsaved registration value from memory. */
export const RegistrationDraftProvider = ({ children }: { children: ReactNode }) => {
  const { userId } = useAuthorizationContext();
  return <DraftProvider key={userId}>{children}</DraftProvider>;
};

export const useRegistrationDraft = (state: RegistrationNavState = {}) => {
  const store = useContext(DraftContext);
  if (!store) throw new Error('RegistrationDraftProvider is required');
  const key = state?.patientId ?? 'new';
  const initial = useRef(store.read(key));
  const keep = useCallback((partial: Partial<RegistrationValues>) => {
    const next = { ...store.read(key, initial.current), ...partial };
    store.keep(key, next);
  }, [store, key]);
  return { values: initial.current, keep, clear: store.clear };
};

/** Seed edits directly in memory; browser history contains only the saved patient's ID. */
export const useBeginRegistration = () => {
  const store = useContext(DraftContext);
  if (!store) throw new Error('RegistrationDraftProvider is required');
  return (patientId: string, values: RegistrationValues) => {
    store.keep(patientId, { ...EMPTY_REGISTRATION, ...values });
  };
};

export const useClearRegistrationDraft = () => {
  const store = useContext(DraftContext);
  if (!store) throw new Error('RegistrationDraftProvider is required');
  return store.clear;
};
