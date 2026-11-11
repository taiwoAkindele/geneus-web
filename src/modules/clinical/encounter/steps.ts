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

/** Saving a disposition (other than observation) closes the encounter, so it can never be skipped. */
export const isClosingStep = (key: StepKey): boolean => key === 'disposition';

/** Steps recorded by laboratory staff from the laboratory queue, not by the consulting clinician. */
export const LAB_STEPS: readonly StepKey[] = ['lab_results'];

/**
 * The one order every visit follows (enforced again by careEntryIssues on the device
 * and the server): vitals and complaint, the testing decision and any order, the
 * results and their review, then the diagnosis made with them, the treatment
 * decisions and the disposition. Dispensing and injections given are recorded
 * afterwards by pharmacy and nursing. Visits recorded in the retired order are only
 * displayed, never continued in it.
 */
export const stepsFor = (data: EncounterData): StepDef[] => {
  const keys: StepKey[] = ['vitals', 'complaint', 'investigation_review'];
  if (data.investigation_review.decision === 'ordered' || data.lab_order.tests.length) keys.push('lab_order');
  if (data.lab_order.tests.length) keys.push('lab_results', 'result_review');
  keys.push('diagnosis', 'prescription', 'injection_order', 'disposition');
  if (data.prescription.rx.length || data.diagnosis.rx.length) keys.push('dispense');
  if (data.injection_order.required) keys.push('injection');
  return keys.map((key) => STEP_DEFS[key]);
};

export const INJECTION_ROUTES = ['IM', 'IV', 'SC', 'ID'];

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
