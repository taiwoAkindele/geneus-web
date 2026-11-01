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
        ...(data.vitals.height ? { heightCm: measured(data.vitals.height) } : {}),
        ...(data.vitals.respiratoryRate ? { respiratoryRate: measured(data.vitals.respiratoryRate) } : {}),
      };
    case 'complaint':
      // Saved as one item: the complaints are free text, written as the patient put them.
      return { complaints: data.complaint.text.trim() ? [data.complaint.text.trim()] : [], note: text(data.complaint.note), ...Object.fromEntries(['historyOfPresentIllness', 'examination', 'assessment', 'plan'].flatMap((key) => {
        const value = data.complaint[key as keyof EncounterData['complaint']];
        return value?.trim() ? [[key, value.trim()]] : [];
      })) };
    case 'result_review': return { resultEntryIds: data.result_review.resultEntryIds, note: text(data.result_review.note) };
    case 'investigation_review':
      return { decision: data.investigation_review.decision, reason: text(data.investigation_review.reason), ...(data.investigation_review.decision === 'ordered' ? { orderEntryId: data.investigation_review.orderEntryId ?? '_pending' } : {}) };
    case 'prescription':
      return { decision: data.prescription.decision, prescription: (toStepValues('diagnosis', { ...data, diagnosis: { ...data.diagnosis, rx: data.prescription.rx } }).prescription as unknown[]) };
    case 'injection_order':
      return { required: data.injection_order.required, ...(data.injection_order.required ? { drug: text(data.injection_order.drug), dose: text(data.injection_order.dose), route: text(data.injection_order.route), instructions: text(data.injection_order.instructions) } : {}) };
    case 'disposition':
      return { kind: data.disposition.kind, note: data.disposition.note.trim(), responsibleService: text(data.disposition.responsibleService), reassessOn: data.disposition.reassessOn ? new Date(data.disposition.reassessOn).toISOString() : undefined, toFacilityId: text(data.disposition.toFacilityId), ...(data.disposition.kind === 'referral' ? { referralId: '_pending' } : {}), previousEntryId: data.disposition.previousEntryId, followUpOn: text(data.disposition.followUpOn) };
    case 'lab_order':
      return { tests: data.lab_order.tests, ...(data.lab_order.items?.length ? { items: data.lab_order.items } : {}), reason: text(data.lab_order.reason ?? '') };
    case 'lab_results':
      return {
        results: data.lab_order.tests
          .map((test, index) => { const item = data.lab_order.items?.[index]; return { test, result: data.lab_results[item?.id ?? test]?.trim() ?? '', ...(item ? { orderItemId: item.id } : {}) }; })
          .filter((row) => row.result),
      };
    case 'diagnosis':
      return {
        diagnosis: data.diagnosis.dx.trim(),
        ...(data.diagnosis.dx.trim() ? {
          diagnoses: [{ label: data.diagnosis.dx.trim(), code: text(data.diagnosis.code ?? ''), codingSystem: data.diagnosis.codingSystem, certainty: data.diagnosis.certainty ?? 'unknown' }, ...(data.diagnosis.diagnoses ?? [])],
        } : {}),
        prescription: data.diagnosis.rx
          .filter((line) => line.name.trim() || line.dose.trim())
          .map((line) => ({ drug: line.name.trim(), dose: line.dose.trim(),
            ...(text(line.frequency ?? '') ? { frequency: line.frequency!.trim() } : {}),
            ...(text(line.duration ?? '') ? { duration: line.duration!.trim() } : {}),
            ...(text(line.route ?? '') ? { route: line.route!.trim() } : {}),
            ...(text(line.quantity ?? '') ? { quantity: measured(line.quantity!) } : {}),
          })),
        giveInjection: false,
        admit: false,
        ...(text(data.diagnosis.pendingResultsReason ?? '') ? { pendingResultsReason: data.diagnosis.pendingResultsReason!.trim() } : {}),
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
        lines: (data.prescription.rx.length ? data.prescription.rx : data.diagnosis.rx).map((line, index) => ({
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
  heightCm: 'height',
  respiratoryRate: 'respiratory rate',
  quantity: 'quantity',
  tests: 'the investigations — choose at least one, or skip this step',
  resultEntryIds: 'the results to review',
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
        vitals: { temp: shown(v.temperatureC), bp, pulse: shown(v.pulseBpm), weight: shown(v.weightKg), spo2: shown(v.spo2Percent), ...(v.heightCm ? { height: shown(v.heightCm) } : {}), ...(v.respiratoryRate ? { respiratoryRate: shown(v.respiratoryRate) } : {}) },
      };
    }
    case 'complaint': {
      const v = ENCOUNTER_STEP_VALUES.complaint.parse(values) as EncounterStepValues['complaint'];
      return { ...data, complaint: { text: v.complaints.join(', '), note: v.note ?? '', ...Object.fromEntries(['historyOfPresentIllness', 'examination', 'assessment', 'plan'].flatMap((key) => v[key as keyof typeof v] ? [[key, v[key as keyof typeof v]]] : [])) } };
    }
    case 'result_review': { const v = ENCOUNTER_STEP_VALUES.result_review.parse(values); return { ...data, result_review: { ...v, note: v.note ?? '' } }; }
    case 'investigation_review': { const v = ENCOUNTER_STEP_VALUES.investigation_review.parse(values); return { ...data, investigation_review: { ...v, reason: v.reason ?? '' } }; }
    case 'prescription': { const v = ENCOUNTER_STEP_VALUES.prescription.parse(values); return { ...data, prescription: { decision: v.decision, rx: v.prescription.map((line) => ({ name: line.drug, dose: line.dose, frequency: line.frequency, duration: line.duration, route: line.route, quantity: line.quantity === undefined ? undefined : String(line.quantity) })) }, diagnosis: { ...data.diagnosis, rx: v.prescription.map((line) => ({ name: line.drug, dose: line.dose, frequency: line.frequency, duration: line.duration, route: line.route, quantity: line.quantity === undefined ? undefined : String(line.quantity) })) } }; }
    case 'injection_order': { const v = ENCOUNTER_STEP_VALUES.injection_order.parse(values); return { ...data, injection_order: { required: v.required, drug: v.drug ?? '', dose: v.dose ?? '', route: v.route ?? '', instructions: v.instructions ?? '' } }; }
    case 'disposition': { const v = ENCOUNTER_STEP_VALUES.disposition.parse(values); return { ...data, disposition: { kind: v.kind, note: v.note, responsibleService: v.responsibleService ?? '', reassessOn: v.reassessOn ?? '', toFacilityId: v.toFacilityId ?? '', previousEntryId: v.previousEntryId, followUpOn: v.followUpOn ?? '' } }; }
    case 'lab_order':
      return { ...data, lab_order: ENCOUNTER_STEP_VALUES.lab_order.parse(values) };
    case 'lab_results': {
      const v = ENCOUNTER_STEP_VALUES.lab_results.parse(values);
      return { ...data, lab_results: { ...data.lab_results, ...Object.fromEntries(v.results.map((row) => [row.orderItemId ?? row.test, row.result])) } };
    }
    case 'diagnosis': {
      const v = ENCOUNTER_STEP_VALUES.diagnosis.parse(values) as EncounterStepValues['diagnosis'];
      return {
        ...data,
        diagnosis: {
          dx: v.diagnosis,
          rx: v.prescription.map((line) => ({ name: line.drug, dose: line.dose, frequency: line.frequency, duration: line.duration, route: line.route, quantity: line.quantity === undefined ? undefined : String(line.quantity) })),
          ...(v.diagnoses?.length ? { code: v.diagnoses[0].code, codingSystem: v.diagnoses[0].codingSystem, certainty: v.diagnoses[0].certainty, diagnoses: v.diagnoses.slice(1) } : {}),
          injection: v.giveInjection,
          admit: v.admit,
          ...(v.pendingResultsReason ? { pendingResultsReason: v.pendingResultsReason } : {}),
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
