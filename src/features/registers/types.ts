/**
 * Register builder (PRD §9.4). A facility configures the registers it keeps:
 * each is a form definition of typed fields; staff record append-only entries
 * against the published version. Mock/local state for the prototype.
 */
export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'phone'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'section';

export type RegisterField = {
  id: string;
  type: FieldType;
  label: string;
  required?: boolean;
  help?: string;
  options?: string[];
};

/** One value per non-section field, keyed by field id. */
export type EntryValue = string | string[] | boolean;
export type EntryValues = Record<string, EntryValue>;

/** An append-only entry, locked to its recorder and time (PRD §9.8.3). */
export type RegisterRow = { id: string; by: string; when: string; values: EntryValues };

export type RegisterStatus = 'Published' | 'Draft';

export type RegisterDef = {
  id: string;
  name: string;
  category: string;
  status: RegisterStatus;
  description: string;
  fields: RegisterField[];
  rows: RegisterRow[];
};

/** The editable shape while building — no id/status/rows until published. */
export type RegisterDraft = Pick<RegisterDef, 'name' | 'category' | 'description' | 'fields'>;
