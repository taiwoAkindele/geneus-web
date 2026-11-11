import type { FieldExplanation } from '@/ui/FieldHelp';

/** Documentation guidance only: examples are never inserted into the clinical record. */
export const ENCOUNTER_FIELD_HELP = {
  temperature: { purpose: 'Record the measured body temperature in degrees Celsius. Leave blank if it was not measured.', example: '37.2' },
  bloodPressure: { purpose: 'Record the measured systolic and diastolic blood pressure together, in mmHg.', example: '120/80' },
  pulse: { purpose: 'Record the measured pulse rate in beats per minute.', example: '76' },
  weight: { purpose: 'Record the measured weight in kilograms. Weight and height from the same observation can be used to calculate BMI.', example: '64.5' },
  oxygen: { purpose: 'Record the oxygen saturation measured by the pulse oximeter, as a percentage.', example: '98' },
  height: { purpose: 'Record the measured height or length in centimetres. Do not enter metres in this field.', example: '165' },
  respiratoryRate: { purpose: 'Record the number of breaths counted in one minute.', example: '18' },
  complaint: { purpose: 'Capture the main reason for this visit in the patient’s own words. Include the symptom and how long it has been present.', example: '“My throat has been sore for two days.”' },
  clinicalNote: { purpose: 'Use this optional space for additional visit context or a brief overall note. Detailed illness history, examination, assessment and plans can go in the separate fields below.', example: 'History provided by the patient; previous paper notes reviewed.' },
  presentingIllness: { purpose: 'Describe the story of the current symptoms: when they began, how they changed, associated symptoms and anything already tried. This is different from past medical history.', example: 'Sore throat began two days ago. Fever began this evening. No treatment reported before this visit.' },
  examination: { purpose: 'Record findings you actually observed or examined. Distinguish findings from symptoms reported by the patient. Leave blank if no examination was performed.', example: 'Throat appears red on examination. Patient is alert.' },
  assessment: { purpose: 'Record your clinical interpretation of the history and examination, including uncertainty or possible explanations. Use the diagnosis step for the formal encounter diagnoses.', example: 'Cause of the sore throat remains under assessment; further findings are needed.' },
  plan: { purpose: 'Record the clinician’s intended next actions, advice and review arrangements. Prescriptions and ordered tests have their own encounter sections.', example: 'Review the requested results at the next consultation; document the advice discussed.' },
  investigations: { purpose: 'Select the investigations the clinician has requested. The selection creates the laboratory worklist for this encounter. Choosing a test records an order, not a result.', example: 'Select FBC only if it has been requested.' },
  result: { purpose: 'Transcribe the result from the laboratory report for this ordered test. Include units, reference information or a qualitative result when supplied by the laboratory.', example: 'Copy the reported value and its unit, or the laboratory’s exact positive/negative wording.' },
  diagnosis: { purpose: 'Record the main diagnosis for this visit. Add other diagnoses separately and state the certainty. A diagnosis becomes an ongoing problem only when reviewed into the problem list.', example: 'Enter the clinician’s documented diagnosis, rather than repeating the symptom history.' },
  additionalDiagnosis: { purpose: 'Record another diagnosis relevant to this visit, separately from the primary diagnosis. Use its own code and certainty where available.' },
  diagnosisCode: { purpose: 'Enter a code only if it is known and matches the documented diagnosis. Choose its coding system. This field does not look up or verify codes.', example: 'A code copied from the facility’s approved terminology reference.' },
  codingSystem: { purpose: 'Identify the terminology used by the diagnosis code: ICD-10, SNOMED CT or a local facility code. Leave uncoded when no code has been recorded.' },
  certainty: { purpose: 'State how certain the diagnosis is. Unknown means certainty has not been documented; suspected is provisional; confirmed records the clinician’s confirmation.' },
  prescription: { purpose: 'Record the medicines prescribed during this encounter. Drug, dose, frequency, duration, route and quantity describe different parts of the prescription. Choices are documentation shortcuts, not treatment recommendations.' },
  drug: { purpose: 'Record the exact medicine name, strength and formulation from the prescription. No medication catalogue or automatic interaction checking is connected.', example: 'Medicine name, strength and tablet/liquid formulation as prescribed.' },
  dose: { purpose: 'Record the amount to take or administer on each occasion. Keep frequency, duration and total supply in their separate fields.', example: '1 tablet, or the prescribed amount with its unit.' },
  frequency: { purpose: 'Record how often the prescribed dose is taken. Choose the prescribed wording or use Other for timing, limits or instructions that are not listed.', example: 'Twice daily; or custom wording copied from the prescription.' },
  duration: { purpose: 'Record how long the prescribed course should continue. Choose a duration only when the prescription specifies it; use Other for an exact end date or different wording.', example: '7 days, if that is the prescribed duration.' },
  medicationRoute: { purpose: 'Record how the medicine is to be taken or given. Choose the prescribed route or enter an unlisted route with Other.', example: 'Oral (by mouth), topical (on the skin), or a custom prescribed route.' },
  quantity: { purpose: 'Record the total amount to supply, rather than the amount per dose. Put the medicine form or supply unit in the drug wording when needed.', example: '14 for a supply of 14 tablets.' },
  disposition: { purpose: 'Record what happens next in this visit. Give injection adds an administration section; Admit patient adds an admission section. These choices do not themselves document completed treatment or create a ward episode.' },
  injectionDrug: { purpose: 'Record the exact medicine actually administered, including strength or formulation when relevant. This documents administration rather than a planned prescription.' },
  injectionDose: { purpose: 'Record the amount actually administered with its unit.', example: 'Copy the administered dose and unit from the medication record.' },
  injectionSite: { purpose: 'Record the body location where the injection was given.', example: 'Left upper arm, if that was the actual administration site.' },
  injectionRoute: { purpose: 'Record the route actually used: IM = intramuscular; IV = intravenous; SC = subcutaneous; ID = intradermal. Only choose the route used.' },
  injectionNote: { purpose: 'Record additional administration details, such as the batch, patient tolerance or an observed reaction. Do not enter an uneventful result unless it was observed.', example: 'Batch identifier and observed response, if recorded.' },
  ward: { purpose: 'Record the intended receiving ward. This records the admission disposition; it does not check live ward capacity or allocate a bed.' },
  bed: { purpose: 'Record the bed reference supplied by the receiving ward, if known. This field does not reserve the bed.', example: 'Bed 4' },
  admittingDiagnosis: { purpose: 'Shows the diagnosis already recorded in this encounter so that it accompanies the admission note. Correct the diagnosis through an amendment if necessary.' },
  admissionNote: { purpose: 'Record the reason for admission and information the receiving team needs for handover.', example: 'Reason for admission, treatment already given and outstanding investigations.' },
  dispensing: { purpose: 'Mark a medicine only after it has actually been handed over. For an item not supplied, record the reason. A prescription alone does not mean it was dispensed.' },
  notDispensed: { purpose: 'Explain why this prescribed item was not supplied. Leave the item unticked; the reason remains part of the signed dispensing record.', example: 'Out of stock; or patient declined the medicine.' },
  followUp: { purpose: 'Choose a review date when the clinician has requested follow-up. Saving this closing step books the review; No follow-up closes the visit without a booking.' },
  reviewDate: { purpose: 'Choose the exact review date if the suggested dates do not fit. Leave blank for no follow-up. This encounter’s closing step creates the follow-up booking.', example: 'The date agreed with the patient.' },
  reviewReason: { purpose: 'State what should be checked at the review so the next clinician knows the purpose of the appointment.', example: 'Review investigation results and symptom progress.' },
  collectLater: { purpose: 'Explain why care is proceeding before the appointment fee is paid. The reason is attributed to the clinician and the bill remains outstanding.', example: 'Payment to be collected after consultation.' },
  correction: { purpose: 'Explain which recorded finding is being corrected and why. The original entry and your signed correction both remain in the record.', example: 'Temperature was transcribed incorrectly; corrected from the source observation.' },
  amendment: { purpose: 'Add a correction or clarification to a saved section. The original remains unchanged. Use Correct recorded values when a structured measurement or diagnosis needs to change.', example: 'Clarification of a previously recorded history detail.' },
} satisfies Record<string, FieldExplanation>;

export const PRESCRIPTION_FREQUENCIES = [
  { value: 'daily', label: 'Once daily' }, { value: 'twice daily', label: 'Twice daily' },
  { value: 'three times daily', label: 'Three times daily' }, { value: 'four times daily', label: 'Four times daily' },
  { value: 'once only', label: 'Once only' },
];
export const PRESCRIPTION_DURATIONS = ['3 days', '5 days', '7 days', '10 days', '14 days', '28 days']
  .map((value) => ({ value, label: value }));
export const PRESCRIPTION_ROUTES = [
  { value: 'oral', label: 'Oral (by mouth)' }, { value: 'topical', label: 'Topical (on the skin)' },
  { value: 'inhaled', label: 'Inhaled' }, { value: 'sublingual', label: 'Sublingual (under the tongue)' },
  { value: 'IM', label: 'Intramuscular (IM)' }, { value: 'IV', label: 'Intravenous (IV)' },
  { value: 'SC', label: 'Subcutaneous (SC)' }, { value: 'ID', label: 'Intradermal (ID)' },
];
