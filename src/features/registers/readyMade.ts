import type { RegisterFieldDef, VisitFact } from '@shared';
import type { RegisterDraft } from './types';

/**
 * Ready-made visit summaries a facility can add in one step, then rename,
 * extend or trim. These are original operational starting points, not official
 * programme forms or reporting profiles; one row always represents one visit.
 */
export type ReadyMadeRegister = { key: string; summary: string; draft: RegisterDraft };

const fromVisit = (id: string, label: string, fact: VisitFact, words?: string[]): RegisterFieldDef =>
  ({ id, type: 'text', label, required: false, fromVisit: { fact, ...(words ? { words } : {}) } });
const asked = (field: Omit<RegisterFieldDef, 'required'> & { required?: boolean }): RegisterFieldDef => ({ required: false, ...field });

const ANTIMALARIALS = ['artemether', 'artesunate', 'lumefantrine', 'amodiaquine', 'dihydroartemisinin', 'piperaquine', 'quinine', 'ACT'];

export const READY_MADE_REGISTERS: readonly ReadyMadeRegister[] = [
  {
    key: 'general-outpatient',
    summary: 'Every visit, filled from the visit record.',
    draft: {
      name: 'General outpatient register', category: 'General',
      description: 'One row for every visit. Filled from the visit: nothing is entered twice.',
      visitLink: { visits: 'every', words: [], codes: [], visitTypes: [] },
      fields: [
        fromVisit('opd-date', 'Date', 'visit_date'), fromVisit('opd-patient-id', 'Patient ID', 'patient_id'),
        fromVisit('opd-name', 'Name', 'patient_name'), fromVisit('opd-age', 'Age', 'age'), fromVisit('opd-sex', 'Sex', 'sex'),
        fromVisit('opd-address', 'Address', 'address'), fromVisit('opd-attendance', 'New or revisit', 'new_or_revisit'),
        fromVisit('opd-weight', 'Weight', 'weight'), fromVisit('opd-temperature', 'Temperature', 'temperature'),
        fromVisit('opd-bp', 'Blood pressure', 'blood_pressure'), fromVisit('opd-complaints', 'Complaints', 'complaints'),
        fromVisit('opd-diagnosis', 'Diagnosis', 'diagnoses'), fromVisit('opd-tests', 'Tests', 'tests'),
        fromVisit('opd-results', 'Results', 'results'), fromVisit('opd-treatment', 'Treatment', 'medicines_prescribed'),
        fromVisit('opd-outcome', 'Outcome', 'outcome'), fromVisit('opd-next', 'Next visit', 'follow_up_date'),
        fromVisit('opd-seen-by', 'Seen by', 'seen_by'),
      ],
    },
  },
  {
    key: 'malaria',
    summary: 'Visits with a malaria test or diagnosis, filled as results and treatment arrive.',
    draft: {
      name: 'Malaria register', category: 'Disease',
      description: 'Every visit where malaria was tested for or diagnosed. Record when the fever started and pregnancy; the visit fills the rest.',
      visitLink: { visits: 'matching', words: ['malaria', 'RDT', 'mRDT', 'MP', 'plasmodium', 'antimalarial'], codes: ['B50', 'B51', 'B52', 'B53', 'B54'], visitTypes: [] },
      fields: [
        fromVisit('mal-date', 'Date', 'visit_date'), fromVisit('mal-patient-id', 'Patient ID', 'patient_id'),
        fromVisit('mal-name', 'Name', 'patient_name'), fromVisit('mal-age', 'Age', 'age'), fromVisit('mal-sex', 'Sex', 'sex'),
        fromVisit('mal-address', 'Address', 'address'),
        asked({ id: 'mal-onset', type: 'date', label: 'Date fever started' }),
        asked({ id: 'mal-pregnant', type: 'select', label: 'Pregnant', options: ['Yes', 'No', 'Not applicable'] }),
        fromVisit('mal-temperature', 'Temperature', 'temperature'),
        fromVisit('mal-rdt', 'RDT result', 'results', ['RDT', 'mRDT']),
        fromVisit('mal-microscopy', 'Microscopy result', 'results', ['MP', 'blood film', 'thick film', 'malaria parasite', 'malaria microscopy']),
        fromVisit('mal-diagnosis', 'Diagnosis', 'diagnoses'),
        fromVisit('mal-treatment', 'Antimalarial given', 'medicines_dispensed', ANTIMALARIALS),
        fromVisit('mal-outcome', 'Outcome', 'outcome'),
      ],
    },
  },
  {
    key: 'antenatal',
    summary: 'One row per antenatal visit, with pregnancy and contact details recorded during care.',
    draft: {
      name: 'Antenatal register', category: 'Maternal',
      description: 'One row per antenatal visit. Record pregnancy and contact details; patient details, observations, tests and treatment come from the visit.',
      visitLink: { visits: 'visit_types', words: [], codes: [], visitTypes: ['antenatal'] },
      fields: [
        fromVisit('anc-date', 'Date', 'visit_date'), fromVisit('anc-patient-id', 'Patient ID', 'patient_id'),
        fromVisit('anc-name', 'Name', 'patient_name'), fromVisit('anc-age', 'Age', 'age'),
        fromVisit('anc-address', 'Address', 'address'), fromVisit('anc-phone', 'Phone', 'phone'),
        asked({ id: 'anc-contact', type: 'number', label: 'Contact number for this pregnancy' }),
        asked({ id: 'anc-ga', type: 'number', label: 'Gestational age (weeks)' }),
        asked({ id: 'anc-gravida', type: 'number', label: 'Gravida' }),
        asked({ id: 'anc-parity', type: 'number', label: 'Parity' }),
        asked({ id: 'anc-edd', type: 'date', label: 'Expected delivery date' }),
        fromVisit('anc-weight', 'Weight', 'weight'), fromVisit('anc-bp', 'Blood pressure', 'blood_pressure'),
        fromVisit('anc-tests', 'Tests requested', 'tests'), fromVisit('anc-results', 'Test results', 'results'),
        fromVisit('anc-medicines', 'Medicines dispensed', 'medicines_dispensed'),
        fromVisit('anc-injections', 'Injections given', 'injections'),
        asked({ id: 'anc-llin', type: 'select', label: 'Net (LLIN) given', options: ['Yes', 'No', 'Not recorded', 'Not applicable'] }),
        fromVisit('anc-outcome', 'Outcome', 'outcome'), fromVisit('anc-next', 'Next visit', 'follow_up_date'),
        fromVisit('anc-seen-by', 'Seen by', 'seen_by'),
      ],
    },
  },
  {
    key: 'immunisation',
    summary: 'One row per immunisation visit, reusing injections given and adding dose and card details.',
    draft: {
      name: 'Immunisation register', category: 'Child health',
      description: 'One row per immunisation visit, which may include several doses. Injections come from the visit; record additional dose, oral vaccine, batch and card details here.',
      visitLink: { visits: 'visit_types', words: [], codes: [], visitTypes: ['immunisation'] },
      fields: [
        fromVisit('imm-date', 'Date', 'visit_date'), fromVisit('imm-patient-id', 'Patient ID', 'patient_id'),
        fromVisit('imm-name', 'Name', 'patient_name'), fromVisit('imm-age', 'Age', 'age'), fromVisit('imm-sex', 'Sex', 'sex'),
        fromVisit('imm-address', 'Address', 'address'), fromVisit('imm-phone', 'Phone', 'phone'),
        fromVisit('imm-injections', 'Injections given', 'injections'),
        asked({ id: 'imm-dose-details', type: 'textarea', label: 'Dose / series details', help: 'Add dose or series numbers for the vaccines recorded in the visit. Leave unknown details blank.' }),
        asked({ id: 'imm-other-vaccines', type: 'textarea', label: 'Other vaccines given', help: 'Record vaccines actually given that are not already in the injection record, including oral vaccines. Include the vaccine and dose.' }),
        asked({ id: 'imm-batch', type: 'textarea', label: 'Vaccine batch details', help: 'Name the vaccine alongside each batch number.' }),
        asked({ id: 'imm-card', type: 'text', label: 'Vaccination card number' }),
        fromVisit('imm-next', 'Next visit', 'follow_up_date'), fromVisit('imm-seen-by', 'Seen by', 'seen_by'),
      ],
    },
  },
  {
    key: 'family-planning',
    summary: 'One row per family planning visit, with method and client details alongside recorded care.',
    draft: {
      name: 'Family planning register', category: 'Maternal',
      description: 'One row per family planning visit. Record method and client details; medicines, injections and the next visit come from the clinical record.',
      visitLink: { visits: 'visit_types', words: [], codes: [], visitTypes: ['family_planning'] },
      fields: [
        fromVisit('fp-date', 'Date', 'visit_date'), fromVisit('fp-patient-id', 'Patient ID', 'patient_id'),
        fromVisit('fp-name', 'Name', 'patient_name'), fromVisit('fp-age', 'Age', 'age'), fromVisit('fp-sex', 'Sex', 'sex'),
        fromVisit('fp-address', 'Address', 'address'), fromVisit('fp-phone', 'Phone', 'phone'),
        asked({ id: 'fp-method', type: 'text', label: 'Method / service provided' }),
        asked({ id: 'fp-client-status', type: 'select', label: 'Client status for this method', options: ['First use', 'Continuing', 'Switching method', 'Not recorded'], help: 'Record the client\'s method history. A first visit to this facility does not establish first use.' }),
        fromVisit('fp-weight', 'Weight', 'weight'), fromVisit('fp-bp', 'Blood pressure', 'blood_pressure'),
        fromVisit('fp-medicines', 'Medicines dispensed', 'medicines_dispensed'),
        fromVisit('fp-injections', 'Injections given', 'injections'),
        asked({ id: 'fp-other-supply', type: 'textarea', label: 'Other commodities supplied', help: 'Record actual supply not already in the dispensing or injection record. Include item and quantity.' }),
        asked({ id: 'fp-notes', type: 'textarea', label: 'Counselling / procedure notes', help: 'Record additional programme information not already in the visit.' }),
        fromVisit('fp-outcome', 'Outcome', 'outcome'), fromVisit('fp-next', 'Next visit', 'follow_up_date'),
        fromVisit('fp-seen-by', 'Seen by', 'seen_by'),
      ],
    },
  },
];
