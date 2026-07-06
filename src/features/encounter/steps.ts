import type { StepKey } from './types';

export type StepDef = { key: StepKey; title: string; hint: string; short: string };

/** The seven sections of an encounter, in order (PRD §9.8.1). */
export const STEPS: StepDef[] = [
  { key: 'vitals', title: 'Vitals', hint: 'Temperature, blood pressure, pulse, weight, SpO₂', short: 'Vitals' },
  { key: 'complaint', title: 'Chief complaint & clinical note', hint: "What the patient reports, plus the clinician's note", short: 'Complaint' },
  { key: 'laborder', title: 'Lab investigations ordered', hint: 'Tests requested for the patient', short: 'Lab order' },
  { key: 'labresults', title: 'Lab results', hint: 'Findings entered against each ordered test', short: 'Results' },
  { key: 'diagnosis', title: 'Diagnosis & prescription', hint: 'Diagnosis from the results, medications prescribed', short: 'Diagnosis' },
  { key: 'dispense', title: 'Medication dispensed', hint: 'What the pharmacy handed over', short: 'Dispense' },
  { key: 'followup', title: 'Follow-up & close encounter', hint: 'Book a review, then lock the encounter', short: 'Follow-up' },
];

export const COMPLAINT_OPTIONS = ['Fever', 'Headache', 'Body pain', 'Chills', 'Vomiting', 'Cough', 'Poor appetite'];
export const TEST_OPTIONS = ['Malaria RDT', 'FBC', 'Widal', 'Blood glucose', 'Urinalysis'];
export const FOLLOWUP_OPTIONS = ['3 days · 10 Jul 2026', '1 week · 14 Jul 2026', '2 weeks · 21 Jul 2026'];

export const AUDIT_LABEL: Record<StepKey, string> = {
  vitals: 'Vitals recorded and locked',
  complaint: 'Chief complaint and clinical note recorded',
  laborder: 'Lab investigations ordered',
  labresults: 'Lab results entered and locked',
  diagnosis: 'Diagnosis made and prescription issued',
  dispense: 'Medication dispensed',
  followup: 'Follow-up booked and encounter closed',
};
