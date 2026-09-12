import { SCHEMA_BY_TYPE, type DocType } from '@shared';

/**
 * What kind of value each contract field holds, read from the Zod schemas.
 * SQLite has fewer types than the contract, and PowerSync delivers rows in
 * SQLite's terms — booleans as 1/0, lists and objects as JSON text — so both
 * the local schema (schema.ts) and the row mapping (rows.ts) need this one
 * answer, derived once, never hand-copied from the contract.
 */
export type FieldKind = 'text' | 'number' | 'boolean' | 'json';

interface ZodDef {
  type?: string;
  innerType?: ZodLike;
}
interface ZodLike {
  _zod?: { def?: ZodDef };
}

const JSON_TYPES = new Set(['array', 'object', 'record', 'tuple']);

/** Unwraps optional/default/nullable to the type underneath. */
const kindOf = (schema: ZodLike): FieldKind => {
  let current: ZodLike | undefined = schema;
  while (current?._zod?.def) {
    const def: ZodDef = current._zod.def;
    if (def.type === 'boolean') return 'boolean';
    if (def.type === 'number') return 'number';
    if (def.type && JSON_TYPES.has(def.type)) return 'json';
    if (!def.innerType) return 'text';
    current = def.innerType;
  }
  return 'text';
};

const cache = new Map<DocType, Record<string, FieldKind>>();

/** Field → kind for one record type, `type` excluded (it is the table). */
export const fieldKindsFor = (type: DocType): Record<string, FieldKind> => {
  const cached = cache.get(type);
  if (cached) return cached;
  const shape = SCHEMA_BY_TYPE[type].shape as Record<string, ZodLike>;
  const kinds = Object.fromEntries(
    Object.entries(shape)
      .filter(([field]) => field !== 'type')
      .map(([field, schema]) => [field, kindOf(schema)]),
  );
  cache.set(type, kinds);
  return kinds;
};
