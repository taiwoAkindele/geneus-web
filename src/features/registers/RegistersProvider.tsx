import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext } from '@/session';
import { addEntry, listDefinitions, listEntries, publishDefinition } from '@/data/repos/registers';
import { listStaff } from '@/data/repos/staff';
import { projectRegisters } from './registerProjection';
import type { EntryValues, RegisterDef, RegisterDraft } from './types';

/**
 * Registers as the screens see them: each register's current definition version
 * with its entries attached. Data lives in the local replica, so a register
 * survives a reload and will sync once replication is switched on.
 */
type NewEntry = { values: EntryValues };

type Value = {
  registers: RegisterDef[];
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
  getById: (registerId: string) => RegisterDef | undefined;
  publish: (draft: RegisterDraft, editingId: string | null) => Promise<void>;
  /** Returns validation issues; an empty list means the entry was saved. */
  addEntry: (registerId: string, entry: NewEntry) => Promise<string[]>;
};

const RegistersContext = createContext<Value | null>(null);

export const RegistersProvider = ({ children }: { children: ReactNode }) => {
  const context = useAuthorizationContext();

  const load = useCallback(async () => {
    const [definitions, entries, staff] = await Promise.all([listDefinitions(), listEntries(), listStaff()]);
    return projectRegisters(definitions, entries, staff);
  }, []);

  const { data, loading, error, reload } = useLiveQuery(load);
  const registers = useMemo(() => data ?? [], [data]);

  const getById = useCallback(
    (registerId: string) => registers.find((register) => register.id === registerId),
    [registers],
  );

  const publish = useCallback(
    async (draft: RegisterDraft, editingId: string | null) => {
      await publishDefinition(draft, editingId, context);
    },
    [context],
  );

  const record = useCallback(
    async (registerId: string, entry: NewEntry) => {
      const result = await addEntry({ registerId, values: entry.values }, context);
      return result.saved ? [] : result.issues;
    },
    [context],
  );

  const value = useMemo<Value>(
    () => ({ registers, loading, error, reload, getById, publish, addEntry: record }),
    [registers, loading, error, reload, getById, publish, record],
  );

  return <RegistersContext.Provider value={value}>{children}</RegistersContext.Provider>;
};

export const useRegisters = (): Value => {
  const context = useContext(RegistersContext);
  if (!context) throw new Error('useRegisters must be used within a RegistersProvider');
  return context;
};
