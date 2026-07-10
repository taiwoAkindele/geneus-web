import type { EncounterData, StepKey } from './types';

export type StepDef = { key: StepKey; title: string; hint: string; short: string };

/** Definition for every possible section (PRD §9.8.1). Which ones appear, and in
 *  what order, is decided per-encounter by `stepsFor`. */
export const STEP_DEFS: Record<StepKey, StepDef> = {
  vitals: { key: 'vitals', title: 'Vitals', hint: 'Temperature, blood pressure, pulse, weight, SpO₂', short: 'Vitals' },
  complaint: { key: 'complaint', title: 'Chief complaint & clinical note', hint: "What the patient reports, plus the clinician's note", short: 'Complaint' },
  laborder: { key: 'laborder', title: 'Lab investigations ordered', hint: 'Tests requested for the patient', short: 'Lab order' },
  labresults: { key: 'labresults', title: 'Lab results', hint: 'Findings entered against each ordered test', short: 'Results' },
  diagnosis: { key: 'diagnosis', title: 'Diagnosis, prescription & plan', hint: 'Diagnosis, medications, and what happens next', short: 'Diagnosis' },
  injection: { key: 'injection', title: 'Injection administered', hint: 'Drug, dose and route — signed by the nurse who gave it', short: 'Injection' },
  dispense: { key: 'dispense', title: 'Medication dispensed', hint: 'What the pharmacy handed over', short: 'Dispense' },
  admission: { key: 'admission', title: 'Admission to facility', hint: 'Ward, bed and admitting note', short: 'Admission' },
  followup: { key: 'followup', title: 'Follow-up & close encounter', hint: 'Book a review, then lock the encounter', short: 'Follow-up' },
};

const HEAD_KEYS: StepKey[] = ['vitals', 'complaint', 'laborder', 'labresults', 'diagnosis'];

/**
 * The ordered sections for one encounter. The head is fixed; the tail grows from
 * the doctor's plan at diagnosis (PRD §9.8): an injection step if ordered, a
 * pharmacy step if anything was prescribed, and either an admission step (locks
 * the encounter as inpatient) or a follow-up step (closes with a review booked).
 */
export const stepsFor = (data: EncounterData): StepDef[] => {
  const tail: StepKey[] = [];
  if (data.diagnosis.injection) tail.push('injection');
  if (data.diagnosis.rx.length > 0) tail.push('dispense');
  if (data.diagnosis.admit) tail.push('admission');
  else tail.push('followup');
  return [...HEAD_KEYS, ...tail].map((k) => STEP_DEFS[k]);
};

export const COMPLAINT_OPTIONS = ['Fever', 'Headache', 'Body pain', 'Chills', 'Vomiting', 'Cough', 'Poor appetite'];
export const TEST_OPTIONS = ['Malaria RDT', 'FBC', 'Widal', 'Blood glucose', 'Urinalysis'];
export const FOLLOWUP_OPTIONS = ['3 days · 12 Jul 2026', '1 week · 16 Jul 2026', '2 weeks · 23 Jul 2026'];
export const INJECTION_ROUTES = ['IM', 'IV', 'SC', 'ID'];
export const WARD_OPTIONS = ['General ward', 'Maternity', 'Paediatric', 'Observation'];

export const AUDIT_LABEL: Record<StepKey, string> = {
  vitals: 'Vitals recorded and locked',
  complaint: 'Chief complaint and clinical note recorded',
  laborder: 'Lab investigations ordered',
  labresults: 'Lab results entered and locked',
  diagnosis: 'Diagnosis made, prescription and plan issued',
  injection: 'Injection administered and locked',
  dispense: 'Medication dispensed',
  admission: 'Patient admitted to facility',
  followup: 'Follow-up booked and encounter closed',
};
