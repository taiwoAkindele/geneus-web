import {
  validateRegisterEntry,
  registerDefinitionIssues,
  type AuthorizationContext,
  type RegisterDefinition,
  type RegisterEntry,
  type RegisterEntryValue,
  type RegisterFieldDef,
} from '@shared';
import { assertAllowed } from '@/auth/authorization';
import { allOfType, envelope, insertRecord, newId } from '../db';
import { calendarDate } from '@/lib/calendarDate';

export type RegisterDraft = {
  name: string;
  category: string;
  description: string;
  fields: RegisterFieldDef[];
};

export const listDefinitions = () => allOfType<RegisterDefinition>('register_definition');
export const listEntries = () => allOfType<RegisterEntry>('register_entry');

const highestVersion = (definitions: RegisterDefinition[], registerId: string): number =>
  definitions
    .filter((definition) => definition.registerId === registerId)
    .reduce((highest, definition) => Math.max(highest, definition.version), 0);

export const currentPublished = (
  definitions: RegisterDefinition[],
  registerId: string,
): RegisterDefinition | undefined =>
  definitions
    .filter((definition) => definition.registerId === registerId && definition.status === 'published')
    .reduce<RegisterDefinition | undefined>(
      (latest, definition) => (!latest || definition.version > latest.version ? definition : latest),
      undefined,
    );

/**
 * Publishing an edit writes a new version instead of rewriting the current one,
 * so entries recorded against earlier versions still render against the fields
 * they were captured with (SCHEMA.md §11.2). Two devices publishing the same
 * version offline collide at the server, which keeps the first and queues the
 * second for reconciliation.
 */
const saveDefinition = async (
  draft: RegisterDraft,
  registerId: string | null,
  context: AuthorizationContext,
  status: 'draft' | 'published',
  expectedVersion?: number,
): Promise<RegisterDefinition> => {
  assertAllowed(context, 'register_definition:publish');
  const definitions = await listDefinitions();
  const id = registerId ?? newId('register_definition');
  const version = highestVersion(definitions, id) + 1;
  if (expectedVersion !== undefined && version !== expectedVersion + 1) throw new Error('A newer register version is available. Reopen its configuration before saving your changes. Your private recovery is kept.');
  const values = { ...draft, name: draft.name.trim(), category: draft.category.trim(), status, fields: draft.fields.map((field) => ({ ...field, label: field.label.trim(), options: field.options?.map((option) => option.trim()) })) };
  const issues = registerDefinitionIssues(values, definitions.filter((definition) => definition.registerId === id));
  if (issues.length) throw new Error(issues.join(' '));
  return insertRecord<RegisterDefinition>(context, 'register_definition:publish', 'register_definition', {
    ...envelope(context),
    id: `${id}:v${version}`,
    type: 'register_definition',
    registerId: id,
    version,
    ...values,
  });
};

/** Each explicit draft save is an immutable snapshot, just like publication. */
export const saveDraftDefinition = (draft: RegisterDraft, registerId: string | null, context: AuthorizationContext, expectedVersion?: number) => saveDefinition(draft, registerId, context, 'draft', expectedVersion);
export const publishDefinition = (draft: RegisterDraft, registerId: string | null, context: AuthorizationContext, expectedVersion?: number) => saveDefinition(draft, registerId, context, 'published', expectedVersion);

export type EntryDraft = {
  registerId: string;
  values: Record<string, RegisterEntryValue>;
};

export type AddEntryResult = { saved: true } | { saved: false; issues: string[] };

/**
 * Per-field rules live in the register's own definition, so they are checked
 * here rather than by a static schema (SCHEMA.md §11.3).
 */
export const addEntry = async (draft: EntryDraft, context: AuthorizationContext): Promise<AddEntryResult> => {
  const definition = currentPublished(await listDefinitions(), draft.registerId);
  if (!definition) return { saved: false, issues: ['Publish this register before recording entries'] };

  const issues = validateRegisterEntry(definition.fields, draft.values);
  const known = new Set(definition.fields.filter((field) => field.type !== 'section').map((field) => field.id));
  if (Object.keys(draft.values).some((field) => !known.has(field))) issues.push('The entry includes a field outside this register version');
  if (issues.length > 0) return { saved: false, issues };

  await insertRecord<RegisterEntry>(context, 'register_entry:create', 'register_entry', {
    ...envelope(context),
    id: newId('register_entry'),
    type: 'register_entry',
    registerId: draft.registerId,
    registerVersion: definition.version,
    entryDate: calendarDate(),
    setting: 'facility',
    values: draft.values,
  });
  return { saved: true };
};

export const seedDefinition = (
  definition: Omit<RegisterDraft, 'fields'> & {
    registerId: string;
    fields: RegisterFieldDef[];
    status: 'draft' | 'published';
    createdOn: string;
  },
  context: AuthorizationContext,
) =>
  insertRecord<RegisterDefinition>(context, 'register_definition:publish', 'register_definition', {
    ...envelope(context, definition.createdOn),
    id: `${definition.registerId}:v1`,
    type: 'register_definition',
    registerId: definition.registerId,
    version: 1,
    name: definition.name,
    category: definition.category,
    description: definition.description,
    status: definition.status,
    fields: definition.fields,
  });

export const seedEntry = (
  entry: {
    registerId: string;
    values: Record<string, RegisterEntryValue>;
    recordedBy: string;
    createdOn: string;
  },
  context: AuthorizationContext,
) =>
  insertRecord<RegisterEntry>(context, 'register_entry:create', 'register_entry', {
    ...envelope({ ...context, userId: entry.recordedBy }, entry.createdOn),
    id: newId('register_entry'),
    type: 'register_entry',
    registerId: entry.registerId,
    registerVersion: 1,
    entryDate: entry.createdOn.slice(0, 10),
    setting: 'facility',
    values: entry.values,
  });
