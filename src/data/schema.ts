import { column, Schema, Table, type ColumnsType, type IndexShorthand } from '@powersync/web';
import type { DocType } from '@shared';
import { fieldKindsFor, type FieldKind } from './contractShape';
import { TABLE_FOR } from './tables';

/**
 * The local SQLite schema, derived from the shared contract: one table per
 * record type (tables.ts), columns matching the contract field for field.
 * PowerSync adds `id` itself.
 */
/**
 * What the screens look records up by. Kept explicit: an index is a cost on a
 * cheap phone, so each one names the query it serves.
 */
const INDEXES: Partial<Record<DocType, IndexShorthand>> = {
  patient: { name: ['fullName'], phone: ['phone'] },
  appointment: { patient: ['patientId'], scheduled: ['scheduledFor'] },
  register_definition: { register: ['registerId'] },
  register_entry: { register: ['registerId'], patient: ['patientId'] },
  roster_shift: { staff: ['staffId'] },
  sync_rejection: { open: ['resolvedOn'] },
};

const COLUMN_FOR: Record<FieldKind, typeof column.text> = {
  text: column.text,
  json: column.text,
  boolean: column.integer,
  number: column.real,
};

const tableFor = (type: DocType): Table => {
  const columns: ColumnsType = {};
  for (const [field, kind] of Object.entries(fieldKindsFor(type))) {
    if (field === 'id') continue;
    columns[field] = COLUMN_FOR[kind];
  }
  return new Table(columns, {
    indexes: INDEXES[type] ?? {},
    // Previous values ride along with each local change, so the server can tell
    // "both devices changed this column" from "only this one did" (SCHEMA.md §7).
    trackPrevious: { onlyWhenChanged: true },
    // A PATCH carries only the columns that changed, so a second edit by the same
    // person would omit `updatedBy`. The actor rides in PowerSync's per-write
    // metadata instead, and the connector restores it (db.ts, connector.ts).
    trackMetadata: true,
  });
};

export const AppSchema = new Schema(
  Object.fromEntries((Object.keys(TABLE_FOR) as DocType[]).map((type) => [TABLE_FOR[type], tableFor(type)])),
);
