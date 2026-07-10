import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { uid } from './constants';
import type { EntryValues, RegisterDef, RegisterDraft } from './types';

/**
 * Shared registers state. A published register is a form definition; staff add
 * append-only rows against it. When the data layer lands this becomes a
 * repository over the shared contract; the API stays the same.
 */
type NewEntry = { by: string; when: string; values: EntryValues };

type Value = {
  registers: RegisterDef[];
  getById: (id: string) => RegisterDef | undefined;
  /** Create (editingId null) or update an existing register, marking it Published. */
  publish: (draft: RegisterDraft, editingId: string | null) => void;
  addEntry: (registerId: string, entry: NewEntry) => void;
};

const RegistersContext = createContext<Value | null>(null);

const SEED: RegisterDef[] = [
  {
    id: 'reg-anc',
    name: 'Antenatal (ANC) Register',
    category: 'Maternal',
    status: 'Published',
    description: 'Filled at every antenatal visit — tracks the pregnancy and flags danger signs.',
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
    rows: [
      { id: 'a1', by: 'Ada Nwosu', when: '2 Jul · 09:20', values: { f2: '2 Jul 2026', f3: '28', f5: '118/76', f6: '68', f7: '27', f8: [], f9: '16 Jul 2026' } },
      { id: 'a2', by: 'Ada Nwosu', when: '25 Jun · 10:02', values: { f2: '25 Jun 2026', f3: '24', f5: '126/82', f6: '66', f7: '23', f8: ['Swelling'], f9: '9 Jul 2026' } },
    ],
  },
  {
    id: 'reg-imm',
    name: 'Immunization Register',
    category: 'Child health',
    status: 'Published',
    description: 'One row per dose given, per child, with the next due date.',
    fields: [
      { id: 'g1', type: 'text', label: 'Child name', required: true },
      { id: 'g2', type: 'date', label: 'Date of birth', required: true },
      { id: 'g3', type: 'select', label: 'Vaccine', required: true, options: ['BCG', 'OPV', 'Penta', 'Measles', 'Yellow fever', 'Vitamin A'] },
      { id: 'g4', type: 'select', label: 'Dose', options: ['Birth', '1st', '2nd', '3rd', 'Booster'] },
      { id: 'g5', type: 'date', label: 'Date given', required: true },
      { id: 'g6', type: 'date', label: 'Next dose due' },
    ],
    rows: [
      { id: 'i1', by: 'Sola Bright', when: '3 Jul · 08:44', values: { g1: 'Baby Amara Eze', g2: '12 Jan 2026', g3: 'Penta', g4: '2nd', g5: '3 Jul 2026', g6: '31 Jul 2026' } },
      { id: 'i2', by: 'Sola Bright', when: '3 Jul · 09:10', values: { g1: 'Baby Tobi Musa', g2: '2 Mar 2026', g3: 'OPV', g4: '1st', g5: '3 Jul 2026', g6: '31 Jul 2026' } },
    ],
  },
  {
    id: 'reg-mal',
    name: 'Malaria Register',
    category: 'Disease',
    status: 'Draft',
    description: 'Case log for suspected and confirmed malaria.',
    fields: [
      { id: 'h1', type: 'text', label: 'Patient name', required: true },
      { id: 'h2', type: 'number', label: 'Age', required: true },
      { id: 'h3', type: 'select', label: 'RDT result', options: ['Positive', 'Negative', 'Not done'] },
    ],
    rows: [],
  },
];

export const RegistersProvider = ({ children }: { children: ReactNode }) => {
  const [registers, setRegisters] = useState<RegisterDef[]>(SEED);

  const getById = useCallback((id: string) => registers.find((r) => r.id === id), [registers]);

  const publish = useCallback((draft: RegisterDraft, editingId: string | null) => {
    const name = draft.name.trim() || 'Untitled register';
    setRegisters((list) => {
      if (editingId) {
        return list.map((r) =>
          r.id === editingId ? { ...r, name, category: draft.category, description: draft.description, fields: draft.fields, status: 'Published' as const } : r,
        );
      }
      return [{ id: uid('reg'), name, category: draft.category, description: draft.description, fields: draft.fields, status: 'Published', rows: [] }, ...list];
    });
  }, []);

  const addEntry = useCallback((registerId: string, entry: NewEntry) => {
    setRegisters((list) =>
      list.map((r) => (r.id === registerId ? { ...r, rows: [{ id: uid('e'), ...entry }, ...r.rows] } : r)),
    );
  }, []);

  const value = useMemo<Value>(() => ({ registers, getById, publish, addEntry }), [registers, getById, publish, addEntry]);

  return <RegistersContext.Provider value={value}>{children}</RegistersContext.Provider>;
};

export const useRegisters = (): Value => {
  const ctx = useContext(RegistersContext);
  if (!ctx) throw new Error('useRegisters must be used within a RegistersProvider');
  return ctx;
};
