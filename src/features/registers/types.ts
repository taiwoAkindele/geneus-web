/**
 * Register feature types — thin aliases over the shared contract (@shared,
 * SCHEMA.md §9). The contract owns the document shapes; this file only maps
 * them to the feature's local names and adds the UI-only view/draft models.
 */
import type {
  RegisterDefinition,
  RegisterEntry,
  RegisterEntryValue,
  RegisterFieldDef,
  RegisterFieldType,
  RegisterStatus,
} from '@shared';

export type FieldType = RegisterFieldType;
export type RegisterField = RegisterFieldDef;
export type EntryValue = RegisterEntryValue;
export type EntryValues = Record<string, EntryValue>;
export type { RegisterDefinition, RegisterEntry, RegisterStatus };

/** One entry projected for display — derived from a `register_entry` document. */
export type RegisterRow = {
  id: string;
  by: string;
  when: string;
  /** The definition version this entry was recorded against (pinned, never migrated). */
  registerVersion: number;
  values: EntryValues;
};

/**
 * A register as the screens see it: the CURRENT (highest-version) definition
 * plus its entries. Projected from contract documents in RegistersProvider.
 */
export type RegisterDef = {
  /** Stable registerId — constant across versions. */
  id: string;
  name: string;
  category: string;
  description: string;
  status: RegisterStatus;
  version: number;
  fields: RegisterField[];
  rows: RegisterRow[];
};

/** The editable shape while building — becomes a NEW definition version on publish. */
export type RegisterDraft = Pick<RegisterDef, 'name' | 'category' | 'description' | 'fields'>;
