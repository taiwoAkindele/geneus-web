import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { RegisterDefinition, RegisterEntry } from '@shared';
import { useLiveQuery, useWriteContext } from '@/data';
import { useCanWrite, useOptionalStaffId } from '@/session';
import { addEntry, listDefinitions, listEntries, publishDefinition } from '@/data/repos/registers';
import type { EntryValues, RegisterDef, RegisterDraft, RegisterRow } from './types';

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
  getById: (registerId: string) => RegisterDef | undefined;
  publish: (draft: RegisterDraft, editingId: string | null) => Promise<void>;
  /** Returns validation issues; an empty list means the entry was saved. */
  addEntry: (registerId: string, entry: NewEntry) => Promise<string[]>;
};

const RegistersContext = createContext<Value | null>(null);

const formatWhen = (iso: string): string => {
  const at = new Date(iso);
  const day = `${at.getDate()} ${at.toLocaleString('en-GB', { month: 'short' })}`;
  return `${day} · ${at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

const project = (definitions: RegisterDefinition[], entries: RegisterEntry[]): RegisterDef[] => {
  const currentByRegister = new Map<string, RegisterDefinition>();
  for (const definition of definitions) {
    const current = currentByRegister.get(definition.registerId);
    if (!current || definition.version > current.version) {
      currentByRegister.set(definition.registerId, definition);
    }
  }

  return [...currentByRegister.values()].map((definition) => ({
    id: definition.registerId,
    name: definition.name,
    category: definition.category,
    description: definition.description,
    status: definition.status,
    version: definition.version,
    fields: definition.fields,
    rows: entries
      .filter((entry) => entry.registerId === definition.registerId)
      .sort((a, b) => b.createdOn.localeCompare(a.createdOn))
      .map(
        (entry): RegisterRow => ({
          id: entry._id,
          by: entry.createdBy,
          when: formatWhen(entry.createdOn),
          registerVersion: entry.registerVersion,
          values: entry.values,
        }),
      ),
  }));
};

export const RegistersProvider = ({ children }: { children: ReactNode }) => {
  const context = useWriteContext(useOptionalStaffId(), useCanWrite());

  const load = useCallback(async () => {
    const [definitions, entries] = await Promise.all([listDefinitions(), listEntries()]);
    return project(definitions, entries);
  }, []);

  const { data, loading, error } = useLiveQuery(load);
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
    () => ({ registers, loading, error, getById, publish, addEntry: record }),
    [registers, loading, error, getById, publish, record],
  );

  return <RegistersContext.Provider value={value}>{children}</RegistersContext.Provider>;
};

export const useRegisters = (): Value => {
  const context = useContext(RegistersContext);
  if (!context) throw new Error('useRegisters must be used within a RegistersProvider');
  return context;
};
