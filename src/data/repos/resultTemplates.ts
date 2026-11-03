import { labPatientFacts, labReportIssues, resolveLibraryParts, type AnswerList, type AnswerListDraft, type AuthorizationContext, type EncounterEntry, type InvestigationItem, type LabReport, type Patient, type ResultPart, type ResultPartDefinition, type ResultPartDraft, type ResultTemplate, type ResultTemplateDraft, type ServiceDefinition, type StandardTemplate, type StandardTest } from '@shared';
import { allOfType, findRecord } from '../db';
import { getDatabase } from '../database';
import { fromRow, type Row } from '../rows';
import { TABLE_FOR } from '../tables';
import { saveWorkforce } from './workforce';

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
const likeOf = (query: string) => `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
type PageRequest = { query?: string; page?: number; pageSize?: number };

/**
 * Templates, shared parts and answer lists are written by the server and arrive
 * here read-only by sync (lib/api/resultTemplates.ts changes them). Alongside
 * them: the active lab tests a template can be used by. Editors read all of them;
 * the settings tables read one page at a time.
 */
export const loadResultTemplateSettings = async () => {
  const [templates, parts, lists, definitions] = await Promise.all([
    allOfType<ResultTemplate>('result_template'), allOfType<ResultPartDefinition>('result_part'),
    allOfType<AnswerList>('answer_list'), allOfType<ServiceDefinition>('service_definition'),
  ]);
  return {
    templates: templates.sort(byName),
    parts: parts.sort((a, b) => a.part.label.localeCompare(b.part.label)),
    lists: lists.sort(byName),
    tests: definitions.filter((d) => d.active && d.investigation).sort(byName),
  };
};
export type ResultTemplateSettings = Awaited<ReturnType<typeof loadResultTemplateSettings>>;

/**
 * The server's structured-result check, run on this device before anything is
 * written: the template revisions this device holds, the visit's latest lab
 * order, and the patient's facts on the day the entry is saved (`createdOn`).
 */
export const labReportSaveIssues = async (patientId: string, prior: readonly EncounterEntry[], report: LabReport, results: readonly { test: string; result: string; orderItemId?: string }[], createdOn: string): Promise<string[]> => {
  const [templates, patient] = await Promise.all([allOfType<ResultTemplate>('result_template'), findRecord<Patient>('patient', patientId)]);
  if (!patient) return ['The patient is not available on this device'];
  const order = [...prior].reverse().find((entry) => entry.step === 'lab_order'), items = (order?.values.items as InvestigationItem[] | undefined) ?? [];
  return labReportIssues(results, report, {
    facts: labPatientFacts(patient, createdOn),
    template: (id, revision) => templates.find((t) => t.id === id && t.revision === revision),
    serviceDefinitionFor: (orderItemId) => items.find((item) => item.id === orderItemId)?.serviceDefinitionId,
  });
};

/* ------------------------------------------------------------------ */
/* Saving on this device, offline included                             */
/* ------------------------------------------------------------------ */

const library = async () => ({ parts: await allOfType<ResultPartDefinition>('result_part'), lists: await allOfType<AnswerList>('answer_list') });

/**
 * Saves a template as its next revision. Shared parts and answer lists are copied in
 * from the library as they stand; the server checks the revision again on sync.
 */
export const saveResultTemplate = async (draft: ResultTemplateDraft, context: AuthorizationContext, existing?: ResultTemplate): Promise<ResultTemplate> => {
  const resolved = resolveLibraryParts(draft.parts, await library());
  if (resolved.issues.length) throw new Error(resolved.issues.join('. '));
  return await saveWorkforce('result_template', { ...draft, parts: resolved.parts, source: existing?.source ?? 'own', ...(existing?.standardKey ? { standardKey: existing.standardKey } : {}) }, context, existing) as ResultTemplate;
};

/** Every template that uses a changed library entry becomes a new revision carrying the change. */
const refreshTemplates = async (uses: (part: ResultPart) => boolean, context: AuthorizationContext) => {
  for (const template of await allOfType<ResultTemplate>('result_template'))
    if (template.parts.some(uses)) await saveResultTemplate({ name: template.name, status: template.status, parts: template.parts, serviceDefinitionIds: template.serviceDefinitionIds }, context, template);
};

export const saveResultPart = async (draft: ResultPartDraft, context: AuthorizationContext, existing?: ResultPartDefinition) => {
  const saved = await saveWorkforce('result_part', draft, context, existing) as ResultPartDefinition;
  if (existing) await refreshTemplates((part) => part.libraryPartId === saved.id, context);
  return saved;
};

export const saveAnswerList = async (draft: AnswerListDraft, context: AuthorizationContext, existing?: AnswerList) => {
  const saved = await saveWorkforce('answer_list', draft, context, existing) as AnswerList;
  if (!existing) return saved;
  // Shared parts copy a list's answers too: refresh them, then every template using the list either way.
  const usesList = (part: ResultPart) => part.kind === 'choice' && part.answerListId === saved.id;
  const parts = (await allOfType<ResultPartDefinition>('result_part')).filter((p) => usesList(p.part));
  for (const shared of parts) await saveWorkforce('result_part', { part: { ...shared.part, answers: saved.answers }, active: shared.active }, context, shared);
  await refreshTemplates((part) => usesList(part) || parts.some((p) => p.id === part.libraryPartId), context);
  return saved;
};

/** This facility's standard templates, marked when one is already added. */
export const loadStandardTemplates = async () => {
  const [standards, templates, tests] = await Promise.all([allOfType<StandardTemplate>('standard_template'), allOfType<ResultTemplate>('result_template'), allOfType<StandardTest>('standard_test')]);
  return standards.sort((a, b) => a.name.localeCompare(b.name)).map((s) => ({ ...s, testNames: s.tests.flatMap((key) => tests.find((t) => t.key === key)?.name ?? []), added: templates.some((t) => t.standardKey === s.key) }));
};
export type StandardTemplateOption = Awaited<ReturnType<typeof loadStandardTemplates>>[number];

/**
 * Adds chosen standard templates exactly as listed, each linked to this facility's
 * tests adopted from the matching standard tests unless another template already
 * serves them. A template already added is skipped.
 */
export const adoptStandardTemplates = async (keys: readonly string[], context: AuthorizationContext) => {
  const [standards, standardTests, definitions] = await Promise.all([allOfType<StandardTemplate>('standard_template'), allOfType<StandardTest>('standard_test'), allOfType<ServiceDefinition>('service_definition')]);
  const added: string[] = [], skipped: string[] = [];
  for (const standard of standards.filter((s) => keys.includes(s.key))) {
    const templates = await allOfType<ResultTemplate>('result_template');
    if (templates.some((t) => t.standardKey === standard.key)) { skipped.push(standard.name); continue; }
    const claimed = new Set(templates.filter((t) => t.status === 'active').flatMap((t) => t.serviceDefinitionIds));
    const concepts = standard.tests.flatMap((key) => standardTests.find((t) => t.key === key)?.concept ?? []);
    const linked = definitions.filter((d) => d.active && d.investigation && !claimed.has(d.id) && concepts.some((c) => c.system === d.concept.system && c.code === d.concept.code)).map((d) => d.id);
    await saveWorkforce('result_template', { name: standard.name, status: 'active', parts: standard.parts, serviceDefinitionIds: linked, source: 'standard', standardKey: standard.key }, context);
    added.push(standard.name);
  }
  return { added, skipped };
};

/** One page of templates, searched by template name or the name of a test that uses it. */
export const loadTemplatePage = async (context: AuthorizationContext, { query = '', page = 0, pageSize = 25 }: PageRequest) => {
  const db = getDatabase(), like = likeOf(query);
  const where = `WHERE t."facilityId" = ? AND (t."name" LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM json_each(t."serviceDefinitionIds") j JOIN ${TABLE_FOR.service_definition} d ON d.id = j.value WHERE d."name" LIKE ? ESCAPE '\\'))`;
  const parameters = [context.facilityId, like, like];
  const [count, rows] = await Promise.all([
    db.getOptional<{ total: number }>(`SELECT COUNT(*) AS total FROM ${TABLE_FOR.result_template} t ${where}`, parameters),
    db.getAll<Row>(`SELECT t.* FROM ${TABLE_FOR.result_template} t ${where} ORDER BY t."name" COLLATE NOCASE LIMIT ? OFFSET ?`, [...parameters, pageSize, Math.max(0, page) * pageSize]),
  ]);
  const templates = rows.map((row) => fromRow<ResultTemplate>('result_template', row));
  const ids = [...new Set(templates.flatMap((t) => t.serviceDefinitionIds))];
  const names = new Map(ids.length ? (await db.getAll<{ id: string; name: string }>(`SELECT id, "name" FROM ${TABLE_FOR.service_definition} WHERE id IN (${ids.map(() => '?').join(',')})`, ids)).map((d) => [d.id, d.name]) : []);
  return { items: templates.map((template) => ({ template, tests: template.serviceDefinitionIds.flatMap((id) => names.get(id) ?? []) })), total: Number(count?.total ?? 0) };
};
export type TemplateRow = Awaited<ReturnType<typeof loadTemplatePage>>['items'][number];

/** How many templates use each of these shared parts or answer lists. */
const usage = async (ids: readonly string[], field: 'libraryPartId' | 'answerListId') => {
  if (!ids.length) return new Map<string, number>();
  const rows = await getDatabase().getAll<{ id: string; uses: number }>(
    `SELECT json_extract(p.value, '$.${field}') AS id, COUNT(DISTINCT t.id) AS uses FROM ${TABLE_FOR.result_template} t, json_each(t."parts") p WHERE json_extract(p.value, '$.${field}') IN (${ids.map(() => '?').join(',')}) GROUP BY 1`, [...ids]);
  return new Map(rows.map((row) => [row.id, Number(row.uses)]));
};

export const loadPartPage = async (context: AuthorizationContext, { query = '', page = 0, pageSize = 25 }: PageRequest) => {
  const db = getDatabase(), where = `WHERE "facilityId" = ? AND json_extract("part", '$.label') LIKE ? ESCAPE '\\'`, parameters = [context.facilityId, likeOf(query)];
  const [count, rows] = await Promise.all([
    db.getOptional<{ total: number }>(`SELECT COUNT(*) AS total FROM ${TABLE_FOR.result_part} ${where}`, parameters),
    db.getAll<Row>(`SELECT * FROM ${TABLE_FOR.result_part} ${where} ORDER BY json_extract("part", '$.label') COLLATE NOCASE LIMIT ? OFFSET ?`, [...parameters, pageSize, Math.max(0, page) * pageSize]),
  ]);
  const parts = rows.map((row) => fromRow<ResultPartDefinition>('result_part', row)), uses = await usage(parts.map((p) => p.id), 'libraryPartId');
  return { items: parts.map((part) => ({ part, uses: uses.get(part.id) ?? 0 })), total: Number(count?.total ?? 0) };
};

export const loadAnswerListPage = async (context: AuthorizationContext, { query = '', page = 0, pageSize = 25 }: PageRequest) => {
  const db = getDatabase(), where = `WHERE "facilityId" = ? AND ("name" LIKE ? ESCAPE '\\' OR "answers" LIKE ? ESCAPE '\\')`, like = likeOf(query), parameters = [context.facilityId, like, like];
  const [count, rows] = await Promise.all([
    db.getOptional<{ total: number }>(`SELECT COUNT(*) AS total FROM ${TABLE_FOR.answer_list} ${where}`, parameters),
    db.getAll<Row>(`SELECT * FROM ${TABLE_FOR.answer_list} ${where} ORDER BY "name" COLLATE NOCASE LIMIT ? OFFSET ?`, [...parameters, pageSize, Math.max(0, page) * pageSize]),
  ]);
  const lists = rows.map((row) => fromRow<AnswerList>('answer_list', row)), uses = await usage(lists.map((l) => l.id), 'answerListId');
  return { items: lists.map((list) => ({ list, uses: uses.get(list.id) ?? 0 })), total: Number(count?.total ?? 0) };
};
