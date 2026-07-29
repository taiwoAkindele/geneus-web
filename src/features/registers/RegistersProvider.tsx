import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { RegisterDefinition, RegisterEntry, validateRegisterEntry } from '@shared';
import { uid } from './constants';
import type { EntryValues, RegisterDef, RegisterDraft, RegisterRow } from './types';

/**
 * Shared registers state, held as real contract documents (SCHEMA.md §9):
 * `register_definition` docs are immutable per version — publishing an edit
 * writes a NEW version — and `register_entry` docs are append-only, pinned to
 * the version they were recorded against. Every document is parsed through the
 * shared schema before entering state, the same rule the PouchDB write path
 * will enforce. Still in-memory: when the data layer lands, these documents
 * move into a repository and the screens' API stays the same.
 */

/** Mock write context until shift auth + device enrollment land (FE-M1). */
const FACILITY_ID = 'OOE-PHC';
const DEVICE_ID = 'device-demo';

const nowIso = () => new Date().toISOString();
const todayIso = () => new Date().toISOString().slice(0, 10);

const fmtWhen = (iso: string): string => {
  const d = new Date(iso);
  const day = `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })}`;
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
};

type NewEntry = { by: string; values: EntryValues };

type Value = {
  registers: RegisterDef[];
  getById: (registerId: string) => RegisterDef | undefined;
  /** Create (editingId null) or version-up an existing register, publishing it. */
  publish: (draft: RegisterDraft, editingId: string | null) => void;
  /** Validate against the register's published definition and record; returns issues (`[]` = saved). */
  addEntry: (registerId: string, entry: NewEntry) => string[];
};

const RegistersContext = createContext<Value | null>(null);

const seedEnvelope = (id: string, createdBy: string, createdOn: string) => ({
  _id: id,
  facilityId: FACILITY_ID,
  createdBy,
  createdOn,
  deviceId: DEVICE_ID,
});

const SEED_DEFS: RegisterDefinition[] = [
  RegisterDefinition.parse({
    ...seedEnvelope('reg-anc:v1', 'system', '2026-06-20T08:00:00+01:00'),
    type: 'register_definition',
    registerId: 'reg-anc',
    version: 1,
    name: 'Antenatal (ANC) Register',
    category: 'Maternal',
    description: 'Filled at every antenatal visit — tracks the pregnancy and flags danger signs.',
    status: 'published',
    fields: [
      { id: 'f1', type: 'section', label: 'Visit' },
      { id: 'f2', type: 'date', label: 'Visit date', required: true },
      { id: 'f3', type: 'number', label: 'Gestational age (weeks)', required: true },
      { id: 'f4', type: 'section', label: 'Examination' },
      { id: 'f5', type: 'text', label: 'Blood pressure (mmHg)', required: true },
      { id: 'f6', type: 'number', label: 'Weight (kg)' },
      { id: 'f7', type: 'number', label: 'Fundal height (cm)' },
      { id: 'f8', type: 'multiselect', label: 'Danger signs', options: ['Bleeding', 'Severe headache', 'Blurred vision', 'Swelling', 'Reduced fetal movement'] },
      { id: 'f9', type: 'date', label: 'Next visit date' },
    ],
  }),
  RegisterDefinition.parse({
    ...seedEnvelope('reg-imm:v1', 'system', '2026-06-20T08:05:00+01:00'),
    type: 'register_definition',
    registerId: 'reg-imm',
    version: 1,
    name: 'Immunization Register',
    category: 'Child health',
    description: 'One row per dose given, per child, with the next due date.',
    status: 'published',
    fields: [
      { id: 'g1', type: 'text', label: 'Child name', required: true },
      { id: 'g2', type: 'date', label: 'Date of birth', required: true },
      { id: 'g3', type: 'select', label: 'Vaccine', required: true, options: ['BCG', 'OPV', 'Penta', 'Measles', 'Yellow fever', 'Vitamin A'] },
      { id: 'g4', type: 'select', label: 'Dose', options: ['Birth', '1st', '2nd', '3rd', 'Booster'] },
      { id: 'g5', type: 'date', label: 'Date given', required: true },
      { id: 'g6', type: 'date', label: 'Next dose due' },
    ],
  }),
  RegisterDefinition.parse({
    ...seedEnvelope('reg-mal:v1', 'system', '2026-06-20T08:10:00+01:00'),
    type: 'register_definition',
    registerId: 'reg-mal',
    version: 1,
    name: 'Malaria Register',
    category: 'Disease',
    description: 'Case log for suspected and confirmed malaria.',
    status: 'draft',
    fields: [
      { id: 'h1', type: 'text', label: 'Patient name', required: true },
      { id: 'h2', type: 'number', label: 'Age', required: true },
      { id: 'h3', type: 'select', label: 'RDT result', options: ['Positive', 'Negative', 'Not done'] },
    ],
  }),
];

const SEED_ENTRIES: RegisterEntry[] = [
  RegisterEntry.parse({
    ...seedEnvelope('register_entry:seed-a1', 'Ada Nwosu', '2026-07-02T09:20:00+01:00'),
    type: 'register_entry',
    registerId: 'reg-anc',
    registerVersion: 1,
    entryDate: '2026-07-02',
    values: { f2: '2026-07-02', f3: '28', f5: '118/76', f6: '68', f7: '27', f8: [], f9: '2026-07-16' },
  }),
  RegisterEntry.parse({
    ...seedEnvelope('register_entry:seed-a2', 'Ada Nwosu', '2026-06-25T10:02:00+01:00'),
    type: 'register_entry',
    registerId: 'reg-anc',
    registerVersion: 1,
    entryDate: '2026-06-25',
    values: { f2: '2026-06-25', f3: '24', f5: '126/82', f6: '66', f7: '23', f8: ['Swelling'], f9: '2026-07-09' },
  }),
  RegisterEntry.parse({
    ...seedEnvelope('register_entry:seed-i1', 'Sola Bright', '2026-07-03T08:44:00+01:00'),
    type: 'register_entry',
    registerId: 'reg-imm',
    registerVersion: 1,
    entryDate: '2026-07-03',
    values: { g1: 'Baby Amara Eze', g2: '2026-01-12', g3: 'Penta', g4: '2nd', g5: '2026-07-03', g6: '2026-07-31' },
  }),
  RegisterEntry.parse({
    ...seedEnvelope('register_entry:seed-i2', 'Sola Bright', '2026-07-03T09:10:00+01:00'),
    type: 'register_entry',
    registerId: 'reg-imm',
    registerVersion: 1,
    entryDate: '2026-07-03',
    values: { g1: 'Baby Tobi Musa', g2: '2026-03-02', g3: 'OPV', g4: '1st', g5: '2026-07-03', g6: '2026-07-31' },
  }),
];

export const RegistersProvider = ({ children }: { children: ReactNode }) => {
  const [definitions, setDefinitions] = useState<RegisterDefinition[]>(SEED_DEFS);
  const [entries, setEntries] = useState<RegisterEntry[]>(SEED_ENTRIES);

  /** Project contract documents into the screens' view: current version + its rows. */
  const registers = useMemo<RegisterDef[]>(() => {
    const currentByRegister = new Map<string, RegisterDefinition>();
    for (const d of definitions) {
      const cur = currentByRegister.get(d.registerId);
      if (!cur || d.version > cur.version) currentByRegister.set(d.registerId, d);
    }
    return [...currentByRegister.values()].map((d) => ({
      id: d.registerId,
      name: d.name,
      category: d.category,
      description: d.description,
      status: d.status,
      version: d.version,
      fields: d.fields,
      rows: entries
        .filter((e) => e.registerId === d.registerId)
        .sort((a, b) => b.createdOn.localeCompare(a.createdOn))
        .map(
          (e): RegisterRow => ({
            id: e._id,
            by: e.createdBy,
            when: fmtWhen(e.createdOn),
            registerVersion: e.registerVersion,
            values: e.values,
          }),
        ),
    }));
  }, [definitions, entries]);

  const getById = useCallback(
    (registerId: string) => registers.find((r) => r.id === registerId),
    [registers],
  );

  const publish = useCallback((draft: RegisterDraft, editingId: string | null) => {
    setDefinitions((list) => {
      const registerId = editingId ?? uid('reg');
      const latest = list
        .filter((d) => d.registerId === registerId)
        .reduce((max, d) => Math.max(max, d.version), 0);
      const version = latest + 1;
      const doc = RegisterDefinition.parse({
        _id: `${registerId}:v${version}`,
        type: 'register_definition',
        facilityId: FACILITY_ID,
        createdBy: 'staff-demo', // mock until shift auth lands
        createdOn: nowIso(),
        deviceId: DEVICE_ID,
        registerId,
        version,
        name: draft.name.trim() || 'Untitled register',
        category: draft.category,
        description: draft.description,
        status: 'published',
        fields: draft.fields,
      });
      // Prepend: older versions are kept, never rewritten (SCHEMA.md §9.2).
      return [doc, ...list];
    });
  }, []);

  const addEntry = useCallback(
    (registerId: string, { by, values }: NewEntry): string[] => {
      const current = definitions
        .filter((d) => d.registerId === registerId && d.status === 'published')
        .reduce<RegisterDefinition | undefined>(
          (max, d) => (!max || d.version > max.version ? d : max),
          undefined,
        );
      if (!current) return ['Publish this register before recording entries'];
      const issues = validateRegisterEntry(current.fields, values);
      if (issues.length) return issues;
      const doc = RegisterEntry.parse({
        _id: `register_entry:${uid('entry')}`,
        type: 'register_entry',
        facilityId: FACILITY_ID,
        createdBy: by,
        createdOn: nowIso(),
        deviceId: DEVICE_ID,
        registerId,
        registerVersion: current.version,
        entryDate: todayIso(),
        setting: 'facility',
        values,
      });
      setEntries((list) => [doc, ...list]);
      return [];
    },
    [definitions],
  );

  const value = useMemo<Value>(
    () => ({ registers, getById, publish, addEntry }),
    [registers, getById, publish, addEntry],
  );

  return <RegistersContext.Provider value={value}>{children}</RegistersContext.Provider>;
};

export const useRegisters = (): Value => {
  const ctx = useContext(RegistersContext);
  if (!ctx) throw new Error('useRegisters must be used within a RegistersProvider');
  return ctx;
};
