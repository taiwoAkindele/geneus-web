import type { EncounterState, StepKey } from './types';

/** Tasks recorded after the consultation: their context is the decision being carried out, not the whole history. */
const TREATMENT_CONTEXT: Partial<Record<StepKey, readonly StepKey[]>> = {
  dispense: ['diagnosis', 'prescription'],
  injection: ['diagnosis', 'injection_order'],
  lab_results: ['complaint', 'lab_order'],
};

/**
 * The earlier sections worth seeing while recording `current`, in visit order.
 * The testing decision is left out once an order exists: the order says the same, in more detail.
 */
export const visitContextSteps = (visitSteps: readonly StepKey[], current: StepKey): StepKey[] => {
  const fixed = TREATMENT_CONTEXT[current];
  if (fixed) return visitSteps.filter((key) => fixed.includes(key));
  const before = visitSteps.slice(0, Math.max(0, visitSteps.indexOf(current)));
  return before.filter((key) => !(key === 'investigation_review' && before.includes('lab_order')));
};

/** Placeholders `summarize` uses for a field nobody filled in. */
const BLANK_VALUES = new Set(['', '—', 'None', 'Not recorded']);

export type SectionState = 'signed' | 'draft' | 'skipped' | 'not_recorded';

type Rows = readonly { label: string; value: string }[];

/**
 * Signed is what the record says. A draft is typed on this device but not signed — shown, never
 * mistaken for the record. It is a draft only when it differs from an untouched section
 * (`emptyRows`): a form default such as "No injection ordered" is not something anyone recorded.
 * Anything else is not recorded, which is different from recorded as normal.
 */
export const sectionState = (enc: Pick<EncounterState, 'sig' | 'skipped'>, key: StepKey, rows: Rows, emptyRows: Rows): SectionState =>
  enc.sig[key] ? 'signed'
    : JSON.stringify(rows) !== JSON.stringify(emptyRows) ? 'draft'
      : enc.skipped.includes(key) ? 'skipped'
        : 'not_recorded';

/** A field left blank inside a signed section reads as not recorded, never as a normal finding. */
export const shownValue = (value: string): string => BLANK_VALUES.has(value.trim()) ? 'Not recorded' : value;
