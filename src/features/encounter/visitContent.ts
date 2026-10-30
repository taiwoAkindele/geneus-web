import type { EncounterEntry } from '@shared';
import { EMPTY_ENCOUNTER_DATA } from './encounterRecord';
import { fromStepValues } from './stepValues';
import { summarize } from './useEncounter';
import type { EncounterData } from './types';

/** Use the form's human labels and units in readers and print summaries too. */
export const entryRows = (entry: EncounterEntry, context: EncounterData = EMPTY_ENCOUNTER_DATA) =>
  entry.step === 'amendment' ? [{ label: 'Amendment', value: String(entry.values.note ?? '') }] : summarize(fromStepValues(entry.step, entry.values, { ...context, workflowVersion: entry.workflowVersion }), entry.step);
