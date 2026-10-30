import type { EncounterData, StepKey } from './types';

export type StepDef = { key: StepKey; title: string; hint: string; short: string };

/** Definition for every possible section (PRD §9.8.1). Which ones appear, and in
 *  what order, is decided per-encounter by `stepsFor`. */
export const STEP_DEFS: Record<StepKey, StepDef> = {
  vitals: { key: 'vitals', title: 'Vitals', hint: 'Temperature, blood pressure, pulse, weight, SpO₂', short: 'Vitals' },
  complaint: { key: 'complaint', title: 'Chief complaint & clinical note', hint: "What the patient reports, plus the clinician's note", short: 'Complaint' },
  lab_order: { key: 'lab_order', title: 'Lab investigations ordered', hint: 'Tests requested for the patient', short: 'Lab order' },
  lab_results: { key: 'lab_results', title: 'Lab results', hint: 'Findings entered against each ordered test', short: 'Results' },
  diagnosis: { key: 'diagnosis', title: 'Assessment / diagnosis', hint: 'Record the clinical assessment independently of treatment', short: 'Diagnosis' },
  result_review: { key: 'result_review', title: 'Review laboratory results', hint: 'Record clinical acknowledgment and any action taken', short: 'Result review' },
  investigation_review: { key: 'investigation_review', title: 'Investigation decision', hint: 'Record whether testing is required', short: 'Testing decision' },
  prescription: { key: 'prescription', title: 'Medication orders', hint: 'Prescribe or record no medication required', short: 'Prescription' },
  injection_order: { key: 'injection_order', title: 'Injection order', hint: 'Request treatment; administration is recorded separately', short: 'Injection order' },
  disposition: { key: 'disposition', title: 'Disposition & care plan', hint: 'Record what happens next and who is responsible', short: 'Disposition' },
  injection: { key: 'injection', title: 'Injection administered', hint: 'Drug, dose and route — signed by the nurse who gave it', short: 'Injection' },
  dispense: { key: 'dispense', title: 'Medication dispensed', hint: 'What the pharmacy handed over', short: 'Dispense' },
  admission: { key: 'admission', title: 'Admission to facility', hint: 'Ward, bed and admitting note', short: 'Admission' },
  follow_up: { key: 'follow_up', title: 'Follow-up & close encounter', hint: 'Book a review, then lock the encounter', short: 'Follow-up' },
};

const HEAD_KEYS: StepKey[] = ['vitals', 'complaint', 'lab_order', 'lab_results', 'diagnosis'];

/** Saving one of these closes the encounter, so it can never be skipped. */
export const isClosingStep = (key: StepKey): boolean => key === 'admission' || key === 'follow_up' || key === 'disposition';

/**
 * The ordered sections for one encounter. The head is fixed; the tail grows from
 * the doctor's plan at diagnosis (PRD §9.8): an injection step if ordered, a
 * pharmacy step if anything was prescribed, and either an admission step (locks
 * the encounter as inpatient) or a follow-up step (closes with a review booked).
 */
export const stepsFor = (data: EncounterData): StepDef[] => {
  if (data.workflowVersion === 1) {
    const keys: StepKey[] = ['vitals', 'complaint', 'diagnosis', 'investigation_review'];
    if (data.investigation_review.decision === 'ordered') keys.push('lab_order');
    keys.push('prescription', 'injection_order', 'disposition');
    if (data.lab_order.tests.length) keys.push('lab_results', 'result_review');
    if (data.prescription.rx.length) keys.push('dispense');
    if (data.injection_order.required) keys.push('injection');
    return keys.map((key) => STEP_DEFS[key]);
  }
  const tail: StepKey[] = [];
  if (data.diagnosis.injection) tail.push('injection');
  if (data.diagnosis.rx.length > 0) tail.push('dispense');
  if (data.diagnosis.admit) tail.push('admission');
  else tail.push('follow_up');
  return [...HEAD_KEYS, ...tail].map((k) => STEP_DEFS[k]);
};

export const TEST_OPTIONS = ['Malaria RDT', 'FBC', 'Widal', 'Blood glucose', 'Urinalysis'];
export const INJECTION_ROUTES = ['IM', 'IV', 'SC', 'ID'];
export const WARD_OPTIONS = ['General ward', 'Maternity', 'Paediatric', 'Observation'];

const FOLLOW_UP_AFTER_DAYS = [
  { days: 3, label: '3 days' },
  { days: 7, label: '1 week' },
  { days: 14, label: '2 weeks' },
];

/** Review dates counted from today; blank means the patient goes home with no review. */
export const followUpOptions = (today = new Date()): { value: string; label: string }[] => [
  ...FOLLOW_UP_AFTER_DAYS.map(({ days, label }) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return { value, label: `${label} · ${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}` };
  }),
  { value: '', label: 'No follow-up' },
];

export const AUDIT_LABEL: Record<StepKey, string> = {
  result_review: 'Laboratory results reviewed',
  investigation_review: 'Investigation decision recorded',
  prescription: 'Medication decision recorded',
  injection_order: 'Injection treatment decision recorded',
  disposition: 'Disposition and care plan recorded',
  vitals: 'Vitals recorded and locked',
  complaint: 'Chief complaint and clinical note recorded',
  lab_order: 'Lab investigations ordered',
  lab_results: 'Lab results entered and locked',
  diagnosis: 'Diagnosis made, prescription and plan issued',
  injection: 'Injection administered and locked',
  dispense: 'Medication dispensed',
  admission: 'Patient admitted to facility',
  follow_up: 'Encounter closed',
};
