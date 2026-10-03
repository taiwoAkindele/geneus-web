import { ENCOUNTER_STEP_VALUES, type EncounterStepValues } from '@shared';
import type { EncounterData, StepKey } from './types';

/**
 * The bridge between a section's form (strings, as typed) and the values its
 * saved entry holds (the contract's `ENCOUNTER_STEP_VALUES`). Both directions
 * live here so a locked section always reads back what was saved.
 */

const text = (value: string): string | undefined => value.trim() || undefined;

/** A blank box is "not taken"; anything else must be a number (NaN fails the contract, with a message). */
const measured = (value: string): number | undefined => (value.trim() === '' ? undefined : Number(value.trim()));

const bloodPressure = (bp: string): { systolicMmHg?: number; diastolicMmHg?: number } => {
  if (!bp.trim()) return {};
  const match = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(bp.trim());
  return match ? { systolicMmHg: Number(match[1]), diastolicMmHg: Number(match[2]) } : { systolicMmHg: Number.NaN };
};

export const toStepValues = (key: StepKey, data: EncounterData): Record<string, unknown> => {
  switch (key) {
    case 'vitals':
      return {
        temperatureC: measured(data.vitals.temp),
        ...bloodPressure(data.vitals.bp),
        pulseBpm: measured(data.vitals.pulse),
        weightKg: measured(data.vitals.weight),
        spo2Percent: measured(data.vitals.spo2),
      };
    case 'complaint':
      return { complaints: data.complaint.complaints, note: text(data.complaint.note) };
    case 'lab_order':
      return { tests: data.lab_order.tests };
    case 'lab_results':
      return {
        results: data.lab_order.tests
          .map((test) => ({ test, result: data.lab_results[test]?.trim() ?? '' }))
          .filter((row) => row.result),
      };
    case 'diagnosis':
      return {
        diagnosis: data.diagnosis.dx.trim(),
        prescription: data.diagnosis.rx
          .filter((line) => line.name.trim() || line.dose.trim())
          .map((line) => ({ drug: line.name.trim(), dose: line.dose.trim() })),
        giveInjection: data.diagnosis.injection,
        admit: data.diagnosis.admit,
      };
    case 'injection':
      return {
        drug: data.injection.drug.trim(),
        dose: data.injection.dose.trim(),
        route: data.injection.route,
        site: text(data.injection.site),
        note: text(data.injection.note),
      };
    case 'dispense':
      return {
        lines: data.diagnosis.rx.map((line, index) => ({
          drug: line.name,
          dispensed: Boolean(data.dispense.done[index]),
          reason: data.dispense.done[index] ? undefined : text(data.dispense.reasons[index] ?? ''),
        })),
      };
    case 'admission':
      return { ward: data.admission.ward, bed: text(data.admission.bed), note: text(data.admission.note) };
    case 'follow_up':
      return { followUpOn: text(data.follow_up.when), reason: text(data.follow_up.reason) };
  }
};

const FIELD_LABEL: Record<string, string> = {
  temperatureC: 'temperature',
  systolicMmHg: 'blood pressure (e.g. 120/80)',
  diastolicMmHg: 'blood pressure (e.g. 120/80)',
  pulseBpm: 'pulse',
  weightKg: 'weight',
  spo2Percent: 'SpO₂ (0–100)',
  tests: 'the investigations — choose at least one, or skip this step',
  results: 'the results — enter at least one',
  diagnosis: 'the diagnosis',
  drug: 'the drug name',
  dose: 'the dose',
  route: 'the route',
  ward: 'the ward',
  followUpOn: 'the follow-up date',
};

/**
 * What is wrong with a section before it may be reviewed, in words a health
 * worker can act on. Empty means it can be saved.
 */
export const stepProblems = (key: StepKey, data: EncounterData): string[] => {
  const parsed = ENCOUNTER_STEP_VALUES[key].safeParse(toStepValues(key, data));
  if (parsed.success) return [];
  const problems = parsed.error.issues.map((issue) => {
    if (issue.code === 'custom') return issue.message;
    const field = [...issue.path].reverse().find((part): part is string => typeof part === 'string' && part in FIELD_LABEL);
    return field ? `Check ${FIELD_LABEL[field]}` : issue.message;
  });
  return [...new Set(problems)];
};

/** A saved entry's values, read back into the shape its section displays. */
export const fromStepValues = (key: StepKey, values: unknown, data: EncounterData): EncounterData => {
  const shown = (value: number | undefined) => (value === undefined ? '' : String(value));
  switch (key) {
    case 'vitals': {
      const v = ENCOUNTER_STEP_VALUES.vitals.parse(values) as EncounterStepValues['vitals'];
      const bp = v.systolicMmHg !== undefined && v.diastolicMmHg !== undefined ? `${v.systolicMmHg}/${v.diastolicMmHg}` : '';
      return {
        ...data,
        vitals: { temp: shown(v.temperatureC), bp, pulse: shown(v.pulseBpm), weight: shown(v.weightKg), spo2: shown(v.spo2Percent) },
      };
    }
    case 'complaint': {
      const v = ENCOUNTER_STEP_VALUES.complaint.parse(values) as EncounterStepValues['complaint'];
      return { ...data, complaint: { complaints: v.complaints, note: v.note ?? '' } };
    }
    case 'lab_order':
      return { ...data, lab_order: { tests: ENCOUNTER_STEP_VALUES.lab_order.parse(values).tests } };
    case 'lab_results': {
      const v = ENCOUNTER_STEP_VALUES.lab_results.parse(values);
      return { ...data, lab_results: Object.fromEntries(v.results.map((row) => [row.test, row.result])) };
    }
    case 'diagnosis': {
      const v = ENCOUNTER_STEP_VALUES.diagnosis.parse(values) as EncounterStepValues['diagnosis'];
      return {
        ...data,
        diagnosis: {
          dx: v.diagnosis,
          rx: v.prescription.map((line) => ({ name: line.drug, dose: [line.dose, line.frequency, line.duration].filter(Boolean).join(' · ') })),
          injection: v.giveInjection,
          admit: v.admit,
        },
      };
    }
    case 'injection': {
      const v = ENCOUNTER_STEP_VALUES.injection.parse(values);
      return { ...data, injection: { drug: v.drug, dose: v.dose, route: v.route, site: v.site ?? '', note: v.note ?? '' } };
    }
    case 'dispense': {
      const v = ENCOUNTER_STEP_VALUES.dispense.parse(values);
      return {
        ...data,
        dispense: {
          done: Object.fromEntries(v.lines.map((line, index) => [index, line.dispensed])),
          reasons: Object.fromEntries(v.lines.map((line, index) => [index, line.reason ?? ''])),
        },
      };
    }
    case 'admission': {
      const v = ENCOUNTER_STEP_VALUES.admission.parse(values);
      return { ...data, admission: { ward: v.ward, bed: v.bed ?? '', note: v.note ?? '' } };
    }
    case 'follow_up': {
      const v = ENCOUNTER_STEP_VALUES.follow_up.parse(values);
      return { ...data, follow_up: { when: v.followUpOn ?? '', reason: v.reason ?? '' } };
    }
  }
};
