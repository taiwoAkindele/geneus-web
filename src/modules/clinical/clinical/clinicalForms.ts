import { SPECIALTY_FIELDS, type ClinicalEvent, type ClinicalKind } from '@shared';

export type ClinicalField = { key: string; label: string; type?: 'date' | 'textarea'; options?: readonly string[]; required?: boolean };
export const CLINICAL_LABELS: Record<ClinicalKind, string> = {
  problem: 'Problem list', history: 'Clinical history & examination', medication: 'Medication reconciliation',
  allergy: 'Allergies', care_plan: 'Care plans', specialty: 'Specialty care',
};
export const CLINICAL_FIELDS: Record<ClinicalKind, ClinicalField[]> = {
  problem: [
    { key: 'label', label: 'Condition / problem', required: true }, { key: 'code', label: 'Diagnosis code (optional)' },
    { key: 'codingSystem', label: 'Coding system', options: ['', 'ICD-10', 'SNOMED CT', 'local'] },
    { key: 'status', label: 'Status', options: ['active', 'resolved', 'inactive'] },
    { key: 'certainty', label: 'Diagnostic certainty', options: ['unknown', 'suspected', 'confirmed'] },
    { key: 'onsetOn', label: 'Onset date', type: 'date' }, { key: 'resolvedOn', label: 'Resolution date', type: 'date' },
    { key: 'note', label: 'Clinical note', type: 'textarea' },
  ],
  history: [
    { key: 'medical', label: 'Past medical history', type: 'textarea' }, { key: 'surgical', label: 'Surgical history', type: 'textarea' },
    { key: 'family', label: 'Family history', type: 'textarea' }, { key: 'social', label: 'Social history', type: 'textarea' },
    { key: 'examination', label: 'Examination', type: 'textarea' }, { key: 'note', label: 'Additional history', type: 'textarea' },
  ],
  medication: [
    { key: 'drug', label: 'Medication', required: true }, { key: 'dose', label: 'Dose', required: true },
    { key: 'frequency', label: 'Frequency', required: true }, { key: 'duration', label: 'Duration' }, { key: 'route', label: 'Route' },
    { key: 'status', label: 'Status', options: ['active', 'stopped', 'completed'] },
    { key: 'startedOn', label: 'Start date', type: 'date' }, { key: 'stoppedOn', label: 'Stop date', type: 'date' },
    { key: 'indication', label: 'Indication' }, { key: 'reconciliationNote', label: 'Reconciliation / reason for change', type: 'textarea' },
  ],
  allergy: [
    { key: 'allergen', label: 'Allergen', required: true }, { key: 'reaction', label: 'Reaction', required: true },
    { key: 'severity', label: 'Severity', options: ['unknown', 'mild', 'moderate', 'severe'] },
    { key: 'verification', label: 'Verification', options: ['reported', 'confirmed', 'refuted'] },
    { key: 'status', label: 'Status', options: ['active', 'inactive'] }, { key: 'note', label: 'Clinical note', type: 'textarea' },
  ],
  care_plan: [
    { key: 'title', label: 'Care plan', required: true }, { key: 'goal', label: 'Treatment / care goal', type: 'textarea', required: true },
    { key: 'actions', label: 'Planned actions', type: 'textarea', required: true },
    { key: 'status', label: 'Status', options: ['active', 'completed', 'cancelled'] },
    { key: 'reviewOn', label: 'Review date', type: 'date' }, { key: 'outcome', label: 'Review findings / outcome', type: 'textarea' },
  ],
  specialty: [
    { key: 'specialty', label: 'Care pathway', options: ['general', 'antenatal', 'paediatrics', 'diabetes', 'hypertension'] },
    { key: 'assessment', label: 'Assessment', type: 'textarea', required: true },
    { key: 'findings', label: 'Examination / findings', type: 'textarea' }, { key: 'plan', label: 'Care plan / next actions', type: 'textarea', required: true },
    { key: 'reviewOn', label: 'Next review date', type: 'date' }, { key: 'outcome', label: 'Progress / review outcome', type: 'textarea' },
    { key: 'status', label: 'Status', options: ['active', 'completed'] },
  ],
};
export const clinicalFormDefaults = (kind: ClinicalKind, event?: ClinicalEvent, initial?: Record<string, unknown>): Record<string, string> => {
  const values = { ...event?.values, ...initial };
  const defaults = Object.fromEntries(CLINICAL_FIELDS[kind].map((field) => [field.key, String(values[field.key] ?? field.options?.[0] ?? '')]));
  if (values.problemId) defaults.problemId = String(values.problemId);
  if (kind === 'specialty') {
    for (const fields of Object.values(SPECIALTY_FIELDS)) for (const label of fields) {
      defaults[`measurement_${label}`] = String((values.measurements as Record<string, unknown> | undefined)?.[label] ?? '');
    }
  }
  return defaults;
};
export const clinicalFormValues = (kind: ClinicalKind, form: Record<string, string>): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  for (const field of CLINICAL_FIELDS[kind]) if (form[field.key]?.trim()) values[field.key] = form[field.key].trim();
  if ((kind === 'medication' || kind === 'care_plan') && form.problemId) values.problemId = form.problemId;
  if (kind === 'specialty') {
    const specialty = form.specialty as keyof typeof SPECIALTY_FIELDS;
    values.measurements = Object.fromEntries((SPECIALTY_FIELDS[specialty] ?? []).flatMap((label) => form[`measurement_${label}`]?.trim() ? [[label, form[`measurement_${label}`].trim()]] : []));
  }
  return values;
};
