import { useCallback } from 'react';
import {
  TEXT_RESULT_PART, effectiveEncounterEntries, labItemSummary, labPatientFacts, labReportIssues, rangeFor, templateForTest,
  type EncounterEntry, type LabPatientFacts, type LabReport, type LabReportItem, type Patient, type ReportValue, type ResultPart, type ResultTemplate,
} from '@shared';
import { useLiveQuery } from '@/data';
import { allOfType, findRecord } from '@/data/db';
import type { EncounterData, LabItemDraft, LabPartDraft, StepKey } from '@/features/encounter/types';
import { EMPTY_ENCOUNTER_DATA } from '@/features/encounter/encounterRecord';
import { fromStepValues } from '@/features/encounter/stepValues';

/** What entering results needs from this device: the templates in use and the patient's record. */
export const useLabSetup = (patientId: string) => useLiveQuery(useCallback(async () => {
  const [templates, patient] = await Promise.all([allOfType<ResultTemplate>('result_template'), findRecord<Patient>('patient', patientId)]);
  return { templates, patient };
}, [patientId]));
export type LabSetup = { templates: readonly ResultTemplate[]; patient?: Patient };

/** "woman, 34", "man, 7 months", or what is known when sex or age is missing. */
export const factsLabel = (facts: LabPatientFacts): string => {
  const who = facts.sex === 'female' ? 'woman' : facts.sex === 'male' ? 'man' : 'patient';
  const age = !facts.age ? '' : facts.age.years >= 2 || facts.age.months === undefined ? `${facts.age.years}` : facts.age.months >= 1 ? `${facts.age.months} month${facts.age.months === 1 ? '' : 's'}` : `${facts.age.days} day${facts.age.days === 1 ? '' : 's'}`;
  return age ? `${who}, ${age}` : who;
};

export const orderKey = (data: EncounterData, index: number) => data.lab_order.items?.[index]?.id ?? data.lab_order.tests[index];
/** The template in use for an ordered test, if it has one. */
export const templateForOrder = (data: EncounterData, index: number, templates: readonly ResultTemplate[]) => templateForTest(templates, data.lab_order.items?.[index]?.serviceDefinitionId);

const filled = (draft?: LabPartDraft) => Boolean(draft && (draft.value?.trim() || draft.growth || draft.files?.length));
export const hasEntry = (draft?: LabItemDraft) => Boolean(draft && (draft.comment.trim() || Object.values(draft.values).some(filled)));

/** One part as published, or nothing when it was left empty. Problems are named for the lab scientist. */
const valueFor = (part: ResultPart, draft: LabPartDraft | undefined, facts: LabPatientFacts, problems: string[]): ReportValue[] => {
  if (!filled(draft)) return [];
  const base = { key: part.key, label: part.label }, flag = draft!.flag ? { flag: draft!.flag } : {}, typed = draft!.value?.trim() ?? '';
  if (part.kind === 'number') {
    const value = Number(typed);
    if (!Number.isFinite(value)) { problems.push(`${part.label}: enter a number`); return []; }
    if (Number(value.toFixed(part.decimals)) !== value) { problems.push(`${part.label}: use ${part.decimals} decimal places at most`); return []; }
    const range = rangeFor(part, facts);
    return [{ kind: 'number', ...base, value, ...(part.unit ? { unit: part.unit } : {}), ...(range ? { range } : {}), ...flag }];
  }
  if (part.kind === 'choice') return typed ? [{ kind: 'choice', ...base, answer: typed, ...flag }] : [];
  if (part.kind === 'text') return typed ? [{ kind: 'text', ...base, text: typed, ...flag }] : [];
  if (part.kind === 'section') return typed ? [{ kind: 'section', ...base, text: typed }] : [];
  if (part.kind === 'images') return draft!.files?.length ? [{ kind: 'images', ...base, files: draft!.files }] : [];
  if (!draft!.growth) { problems.push(`${part.label}: record growth or no growth`); return []; }
  const organisms = draft!.growth === 'growth' ? (draft!.organisms ?? []).filter((o) => o.name.trim()).map((o) => ({
    name: o.name.trim(), ...(o.count.trim() ? { count: o.count.trim() } : {}),
    susceptibility: Object.entries(o.susceptibility).flatMap(([antibiotic, result]) => result ? [{ antibiotic, result }] : []),
  })) : [];
  if (draft!.growth === 'growth' && !organisms.length) { problems.push(`${part.label}: name the organism grown`); return []; }
  return [{ kind: 'culture', ...base, growth: draft!.growth, organisms, ...flag }];
};

export type LabSubmission = { values: { results: { test: string; result: string; orderItemId?: string }[] }; labReport: LabReport; problems: string[] };

/**
 * The lab results being published: one plain summary line per test in `values`
 * (what every device reads) and the structured report beside it. A test with no
 * template is one free-text result. Tests left empty stay pending. Runs the same
 * shared checks the server runs, so a refusal shows here, not after sync.
 */
export const buildLabSubmission = (data: EncounterData, setup: LabSetup, on: string): LabSubmission => {
  const facts = setup.patient ? labPatientFacts(setup.patient, on) : {};
  const problems: string[] = [], results: LabSubmission['values']['results'] = [], items: LabReportItem[] = [];
  data.lab_order.tests.forEach((test, index) => {
    const key = orderKey(data, index), order = data.lab_order.items?.[index], template = templateForOrder(data, index, setup.templates);
    const identity = { test, ...(order ? { orderItemId: order.id } : {}) };
    let item: LabReportItem | undefined;
    if (!template) {
      const text = data.lab_results[key]?.trim();
      if (text) item = { ...identity, values: [{ kind: 'text', key: TEXT_RESULT_PART.key, label: TEXT_RESULT_PART.label, text }] };
    } else if (hasEntry(data.lab_report[key])) {
      const draft = data.lab_report[key], own: string[] = [];
      const values = template.parts.flatMap((part) => valueFor(part, draft.values[part.key], facts, own));
      problems.push(...own.map((problem) => `${test}: ${problem}`));
      if (!own.length && !values.length) problems.push(`${test}: enter at least one result`);
      if (values.length) item = { ...identity, template: { id: template.id, revision: template.revision }, values, ...(draft.comment.trim() ? { comment: draft.comment.trim() } : {}) };
    }
    if (!item) return;
    items.push(item);
    results.push({ ...identity, result: labItemSummary(item, template?.parts ?? [TEXT_RESULT_PART]) });
  });
  const labReport: LabReport = { patient: facts, items };
  if (!items.length && !problems.length) problems.push('Enter at least one result before previewing the report');
  if (!problems.length) problems.push(...labReportIssues(results, labReport, {
    facts, template: (id, revision) => setup.templates.find((t) => t.id === id && t.revision === revision),
    serviceDefinitionFor: (orderItemId) => data.lab_order.items?.find((i) => i.id === orderItemId)?.serviceDefinitionId,
  }));
  return { values: { results }, labReport, problems };
};

/**
 * The visit's lab order narrowed to the tests still awaiting a result, for entering
 * results after some were already published. Corrections are read as they stand.
 */
export const pendingLabOrder = (entries: readonly EncounterEntry[]): EncounterData => {
  let data = structuredClone(EMPTY_ENCOUNTER_DATA);
  for (const entry of effectiveEncounterEntries([...entries])) if (entry.step !== 'amendment') data = fromStepValues(entry.step as StepKey, entry.values, data);
  const done = new Set(Object.keys(data.lab_results));
  const pending = data.lab_order.tests.map((test, index) => ({ test, item: data.lab_order.items?.[index] })).filter(({ test, item }) => !done.has(item?.id ?? test));
  return { ...data, lab_order: { ...data.lab_order, tests: pending.map((p) => p.test), ...(data.lab_order.items ? { items: pending.flatMap((p) => p.item ? [p.item] : []) } : {}) }, lab_results: {}, lab_report: {} };
};

/** A published report as an editable draft again, for a correction. */
export const draftsFromReport = (report: LabReport | undefined): Record<string, LabItemDraft> => Object.fromEntries((report?.items ?? []).filter((item) => item.template).map((item) => [item.orderItemId ?? item.test, {
  comment: item.comment ?? '',
  values: Object.fromEntries(item.values.map((value): [string, LabPartDraft] => [value.key,
    value.kind === 'number' ? { value: String(value.value), flag: value.flag ?? '' }
    : value.kind === 'choice' ? { value: value.answer, flag: value.flag ?? '' }
    : value.kind === 'text' ? { value: value.text, flag: value.flag ?? '' }
    : value.kind === 'section' ? { value: value.text }
    : value.kind === 'images' ? { files: value.files }
    : { growth: value.growth, flag: value.flag ?? '', organisms: value.organisms.map((o) => ({ name: o.name, count: o.count ?? '', susceptibility: Object.fromEntries(o.susceptibility.map((s) => [s.antibiotic, s.result])) })) }])),
}]));
