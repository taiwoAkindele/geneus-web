import { db, type WriteContext } from './db';
import { book } from './repos/appointments';
import { seedPatient } from './repos/patients';
import { seedDefinition, seedEntry } from './repos/registers';

/**
 * Demo content for the prototype, written once into an empty replica so the
 * screens have something to show. Real facilities start empty and build their
 * own registers; delete this module once onboarding creates real data.
 */
const seedRegisters = async (context: WriteContext) => {
  await seedDefinition(
    {
      registerId: 'reg-anc',
      name: 'Antenatal (ANC) Register',
      category: 'Maternal',
      description: 'Filled at every antenatal visit — tracks the pregnancy and flags danger signs.',
      status: 'published',
      createdOn: '2026-06-20T08:00:00+01:00',
      fields: [
        { id: 'f1', type: 'section', label: 'Visit', required: false },
        { id: 'f2', type: 'date', label: 'Visit date', required: true },
        { id: 'f3', type: 'number', label: 'Gestational age (weeks)', required: true },
        { id: 'f4', type: 'section', label: 'Examination', required: false },
        { id: 'f5', type: 'text', label: 'Blood pressure (mmHg)', required: true },
        { id: 'f6', type: 'number', label: 'Weight (kg)', required: false },
        { id: 'f7', type: 'number', label: 'Fundal height (cm)', required: false },
        {
          id: 'f8',
          type: 'multiselect',
          label: 'Danger signs',
          required: false,
          options: ['Bleeding', 'Severe headache', 'Blurred vision', 'Swelling', 'Reduced fetal movement'],
        },
        { id: 'f9', type: 'date', label: 'Next visit date', required: false },
      ],
    },
    context,
  );

  await seedDefinition(
    {
      registerId: 'reg-imm',
      name: 'Immunization Register',
      category: 'Child health',
      description: 'One row per dose given, per child, with the next due date.',
      status: 'published',
      createdOn: '2026-06-20T08:05:00+01:00',
      fields: [
        { id: 'g1', type: 'text', label: 'Child name', required: true },
        { id: 'g2', type: 'date', label: 'Date of birth', required: true },
        {
          id: 'g3',
          type: 'select',
          label: 'Vaccine',
          required: true,
          options: ['BCG', 'OPV', 'Penta', 'Measles', 'Yellow fever', 'Vitamin A'],
        },
        {
          id: 'g4',
          type: 'select',
          label: 'Dose',
          required: false,
          options: ['Birth', '1st', '2nd', '3rd', 'Booster'],
        },
        { id: 'g5', type: 'date', label: 'Date given', required: true },
        { id: 'g6', type: 'date', label: 'Next dose due', required: false },
      ],
    },
    context,
  );

  await seedDefinition(
    {
      registerId: 'reg-mal',
      name: 'Malaria Register',
      category: 'Disease',
      description: 'Case log for suspected and confirmed malaria.',
      status: 'draft',
      createdOn: '2026-06-20T08:10:00+01:00',
      fields: [
        { id: 'h1', type: 'text', label: 'Patient name', required: true },
        { id: 'h2', type: 'number', label: 'Age', required: true },
        {
          id: 'h3',
          type: 'select',
          label: 'RDT result',
          required: false,
          options: ['Positive', 'Negative', 'Not done'],
        },
      ],
    },
    context,
  );

  await seedEntry(
    {
      registerId: 'reg-anc',
      recordedBy: 'Ada Nwosu',
      createdOn: '2026-07-02T09:20:00+01:00',
      values: { f2: '2026-07-02', f3: '28', f5: '118/76', f6: '68', f7: '27', f8: [], f9: '2026-07-16' },
    },
    context,
  );
  await seedEntry(
    {
      registerId: 'reg-anc',
      recordedBy: 'Ada Nwosu',
      createdOn: '2026-06-25T10:02:00+01:00',
      values: { f2: '2026-06-25', f3: '24', f5: '126/82', f6: '66', f7: '23', f8: ['Swelling'], f9: '2026-07-09' },
    },
    context,
  );
  await seedEntry(
    {
      registerId: 'reg-imm',
      recordedBy: 'Sola Bright',
      createdOn: '2026-07-03T08:44:00+01:00',
      values: { g1: 'Baby Amara Eze', g2: '2026-01-12', g3: 'Penta', g4: '2nd', g5: '2026-07-03', g6: '2026-07-31' },
    },
    context,
  );
  await seedEntry(
    {
      registerId: 'reg-imm',
      recordedBy: 'Sola Bright',
      createdOn: '2026-07-03T09:10:00+01:00',
      values: { g1: 'Baby Tobi Musa', g2: '2026-03-02', g3: 'OPV', g4: '1st', g5: '2026-07-03', g6: '2026-07-31' },
    },
    context,
  );
};

const seedPeople = async (context: WriteContext) => {
  await seedPatient(
    {
      patientId: 'OOE-PHC-000047-K2',
      fullName: 'Amaka Okoro',
      address: '12 Odo-Ona Elewe Road, Ibadan',
      sex: 'female',
      ageYears: 32,
      phone: '080 1234 5678',
      allergies: ['Penicillin'],
      createdOn: '2026-06-21T09:00:00+01:00',
    },
    context,
  );
  await seedPatient(
    {
      patientId: 'OOE-PHC-000051-B7',
      fullName: 'Ibrahim Musa',
      address: '4 Challenge Street, Ibadan',
      sex: 'male',
      ageYears: 45,
      allergies: ['Sulfa drugs'],
      createdOn: '2026-06-28T11:30:00+01:00',
    },
    context,
  );

  await book(
    { patientId: 'OOE-PHC-000047-K2', reason: 'Malaria recovery review', scheduledFor: '2026-07-16T10:00:00+01:00' },
    context,
    '2026-07-03T12:00:00+01:00',
  );
  await book({ patientId: 'OOE-PHC-000051-B7', reason: 'BP check' }, context, '2026-07-03T08:00:00+01:00');
};

export const seedIfEmpty = async (context: WriteContext): Promise<void> => {
  const { total_rows: totalRows } = await db.allDocs({ limit: 1 });
  if (totalRows > 0) return;
  await seedPeople(context);
  await seedRegisters(context);
};
