import type { RegisterFieldDef, VisitFact } from '@shared';
import type { RegisterDraft } from './types';

/**
 * Ready-made registers a facility can add in one step. They are starting points
 * shaped on the NHMIS daily registers, not the official forms: once added, each
 * is an ordinary register the facility can rename, extend or trim.
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
];
