import type { ClinicalKind } from '@shared';
import type { FieldExplanation } from '@/ui/FieldHelp';
import { ENCOUNTER_FIELD_HELP as H } from '@/features/encounter/fieldHelp';

const COMMON: Record<string, FieldExplanation> = {
  label: { purpose: 'Name an ongoing condition or clinical problem that should be visible across future visits. An encounter diagnosis can be reviewed into this list.' },
  code: H.diagnosisCode, codingSystem: H.codingSystem, certainty: H.certainty,
  onsetOn: { purpose: 'Record when the condition began, if known. This helps distinguish a longstanding condition from a new problem.' },
  resolvedOn: { purpose: 'Record when the problem was considered resolved, if known. Earlier versions remain in the history.' },
  medical: { purpose: 'Record important previous illnesses and ongoing conditions relevant to care. Put the current symptom story in the encounter’s history of presenting illness.', example: 'Previous diagnosed conditions and relevant dates, as reported or documented.' },
  surgical: { purpose: 'Record previous operations or procedures that may affect current or future care.', example: 'Procedure name and approximate date, if known.' },
  family: { purpose: 'Record relevant health conditions in relatives, identifying the relationship and whether the information is reported or documented.', example: 'Condition reported in a parent or sibling.' },
  social: { purpose: 'Record relevant living circumstances, occupation, support and reported exposures or habits. Include only information relevant to the patient’s care.' },
  examination: H.examination, drug: H.drug, dose: H.dose, frequency: H.frequency, duration: H.duration, route: H.medicationRoute,
  startedOn: { purpose: 'Record when the patient began this medication, if known. This is separate from the date it was entered into Geneus.' },
  stoppedOn: { purpose: 'Record when the medicine was stopped or completed, if known. State the reason for a change in the reconciliation note.' },
  indication: { purpose: 'Record why the patient is taking this medicine. Link a documented problem below when available.' },
  reconciliationNote: { purpose: 'Record what was checked with the patient or prior record and why a medicine, dose or status changed.', example: 'Medication list reviewed with the patient; reason for any change documented.' },
  allergen: { purpose: 'Name the substance associated with the reported or confirmed allergy. Reviewing a legacy entry keeps its original source record.' },
  reaction: { purpose: 'Record the actual reported or observed reaction. If reviewing a disputed allergy, document the review finding rather than inventing a reaction.', example: 'The reported rash or other reaction, including what is known about it.' },
  severity: { purpose: 'Record the clinician’s assessment of reaction severity. Choose unknown when severity has not been established.' },
  verification: { purpose: 'Distinguish a patient-reported allergy from one confirmed or refuted through clinical review. Refutation updates the current alert while preserving history.' },
  title: { purpose: 'Give this care plan a clear name so it can be identified during later reviews.', example: 'Review of symptom progress' },
  goal: { purpose: 'Describe the outcome the plan is intended to achieve so progress can be reviewed later.' },
  actions: { purpose: 'Record the clinician’s agreed actions for this plan and any responsibilities or review arrangements.' },
  reviewOn: { purpose: 'Record when this plan or assessment should be reviewed. This date does not book a visit; use Book appointment to reserve one.' },
  outcome: { purpose: 'At review, record progress, findings and the outcome of the earlier plan. This creates a new version while preserving the previous plan.' },
  specialty: { purpose: 'Choose the documentation pathway for this assessment. It adds relevant fields without supplying a diagnosis or treatment protocol.' },
  assessment: H.assessment, findings: H.examination, plan: H.plan,
  note: { purpose: 'Record additional information relevant to this clinical record that has not been captured in its other fields.' },
  problemId: { purpose: 'Optionally connect this medicine or care plan to an existing problem belonging to the same source patient record.' },
};
const STATUS: Record<ClinicalKind, FieldExplanation> = {
  problem: { purpose: 'Active problems remain relevant to ongoing care. Use resolved or inactive when the clinician has reviewed the condition’s status; the history is preserved.' },
  history: { purpose: 'Record reviewed clinical history.' },
  medication: { purpose: 'Identify whether the patient is currently taking the medicine, has stopped it or has completed the course. Earlier medication versions remain available.' },
  allergy: { purpose: 'Active allergies appear in current alerts unless refuted. Inactive entries stay in the clinical history.' },
  care_plan: { purpose: 'Identify whether the care plan is ongoing, completed or cancelled. Record a review outcome when changing its status.' },
  specialty: { purpose: 'Mark whether this assessment and its follow-up remain active or have been completed. Record the outcome in the review field.' },
};
export const clinicalFieldHelp = (kind: ClinicalKind, key: string): FieldExplanation =>
  key === 'status' ? STATUS[kind] : COMMON[key];

export const SPECIALTY_MEASUREMENT_HELP: Record<string, FieldExplanation> = {
  Symptoms: H.complaint, Examination: H.examination,
  'Gestational age (weeks)': { purpose: 'Record the documented or assessed gestational age in weeks and the source of the estimate if relevant.' },
  'Gravidity / parity': { purpose: 'Record the pregnancy and birth history using the facility’s obstetric notation. Explain uncertain or reported information.' },
  'Obstetric findings': { purpose: 'Record findings actually assessed during this antenatal review. Leave unassessed findings blank.' },
  'Height / length (cm)': H.height,
  'Head circumference (cm)': { purpose: 'Record the measured head circumference in centimetres, when assessed. No growth-centile calculation is provided.' },
  Development: { purpose: 'Record the development discussed or assessed at this visit, identifying the source of reported information.' },
  Feeding: { purpose: 'Record the feeding history relevant to the child’s assessment, as reported or observed.' },
  'Blood glucose (value and unit)': { purpose: 'Record the measured glucose value with its unit and relevant measurement context from the source report. No unit conversion is performed.' },
  'HbA1c (%)': { purpose: 'Record the HbA1c percentage exactly as reported by the laboratory. Do not enter a result reported in a different unit without identifying that unit.' },
  'Foot examination': { purpose: 'Record findings actually assessed during the foot examination. Leave blank if not examined.' },
  Adherence: { purpose: 'Record the patient’s report of how the agreed treatment or plan is being followed, including any barriers discussed.' },
  'Home BP readings': { purpose: 'Record blood pressure readings reported from home, with dates or context if available. Distinguish them from measurements taken at this visit.' },
  'Cardiovascular history': { purpose: 'Record relevant previously diagnosed conditions, events and reported history reviewed during this assessment.' },
};
