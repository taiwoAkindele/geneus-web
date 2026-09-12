import { parseDocument, type AnyDocument, type DocType } from '@shared';
import { fieldKindsFor } from './contractShape';

/**
 * The boundary between SQLite rows (what PowerSync stores and uploads) and
 * contract records (what the repositories and screens use). SQLite knows text,
 * numbers and nothing else, so booleans travel as 1/0 and lists and objects as
 * JSON text; absent fields are NULL. Both directions live here and nowhere else.
 */
export type Row = Record<string, unknown>;

/** Record → row values, ready to bind. `undefined` becomes NULL. */
export const toRow = (type: DocType, record: Record<string, unknown>): Row => {
  const kinds = fieldKindsFor(type);
  const row: Row = {};
  for (const [field, value] of Object.entries(record)) {
    if (field === 'type') continue;
    if (value === undefined || value === null) {
      row[field] = null;
      continue;
    }
    switch (kinds[field]) {
      case 'boolean':
        row[field] = value ? 1 : 0;
        break;
      case 'json':
        row[field] = JSON.stringify(value);
        break;
      default:
        row[field] = value;
    }
  }
  return row;
};

/**
 * Row values → contract values, without validating: the partial case (a PATCH's
 * changed columns) needs this too. NULLs are dropped — the contract uses
 * absence, not null.
 */
export const decodeValues = (type: DocType, row: Row): Record<string, unknown> => {
  const kinds = fieldKindsFor(type);
  const record: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(row)) {
    if (value === null || value === undefined) continue;
    switch (kinds[field]) {
      case 'boolean':
        record[field] = value === 1 || value === true || value === '1';
        break;
      case 'number':
        record[field] = typeof value === 'number' ? value : Number(value);
        break;
      case 'json':
        record[field] = typeof value === 'string' ? JSON.parse(value) : value;
        break;
      default:
        record[field] = value;
    }
  }
  return record;
};

/**
 * Row → validated record, defaults applied. A row the contract no longer
 * recognises is logged and returned as-is rather than thrown: reading must
 * never quietly discard what it does not recognise (SCHEMA.md §9), and a
 * screen is better off with an odd record than with no list at all.
 */
export const fromRow = <T extends AnyDocument>(type: DocType, row: Row): T => {
  const decoded = { ...decodeValues(type, row), type };
  const parsed = parseDocument(decoded);
  if (!parsed.success) {
    console.warn(`record ${String(row.id)} in ${type} does not match the contract`, parsed.error.issues);
    return decoded as T;
  }
  return { ...decoded, ...(parsed.data as object) } as T;
};
