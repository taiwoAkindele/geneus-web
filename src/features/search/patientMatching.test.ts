import { describe, expect, it } from 'vitest';
import type { Patient } from '@shared';
import type { PatientDetails } from '@/data/repos/patients';
import { currentAge, findLikelyMatches, namesMatch, phoneKey, searchPatients } from './patientMatching';

const NOW = Date.parse('2026-10-02T09:00:00Z');

const patient = (overrides: Partial<Patient>): Patient => ({
  id: 'OOE-PHC-000047-K2',
  type: 'patient',
  facilityId: 'OOE-PHC',
  schemaVersion: 3,
  createdBy: 'staff:records',
  createdOn: '2026-10-01T09:00:00Z',
  deviceId: 'device-1',
  patientId: 'OOE-PHC-000047-K2',
  fullName: 'Amaka Okoro',
  address: '14 Odo-Ona Elewe, Ibadan',
  sex: 'female',
  ageYears: 32,
  dobEstimated: false,
  allergies: [],
  phone: '0803 555 0147',
  ...overrides,
});

const amaka = patient({});
const mother = patient({ id: 'OOE-PHC-000012-AB', patientId: 'OOE-PHC-000012-AB', fullName: 'Ngozi Okoro', ageYears: 58, createdOn: '2026-09-01T09:00:00Z' });
const ibrahim = patient({ id: 'OOE-PHC-000231-T4', patientId: 'OOE-PHC-000231-T4', fullName: 'Ibrahim Musa', sex: 'male', ageYears: 34, phone: '0805 111 2222', createdOn: '2026-09-20T09:00:00Z' });

const registering = (overrides: Partial<PatientDetails>): PatientDetails => ({
  fullName: 'Amaka Okoro',
  address: 'Odo-Ona',
  sex: 'female',
  ageYears: 33,
  ...overrides,
});

describe('the duplicate check', () => {
  it('flags the same name, sex and a close age as the same person', () => {
    const [match] = findLikelyMatches(registering({}), [amaka, ibrahim], NOW);

    expect(match.patient).toBe(amaka);
    expect(match.reasons).toEqual(expect.arrayContaining(['name', 'age', 'sex']));
  });

  it('matches names written in another order, or with a middle name or a slip', () => {
    expect(namesMatch('Okoro Amaka', 'Amaka Okoro')).toBe(true);
    expect(namesMatch('Amaka Okoro', 'Amaka Grace Okoro')).toBe(true);
    expect(namesMatch('Ammaka Okoro', 'Amaka Okoro')).toBe(true);
    expect(namesMatch('Ada Okoro', 'Amaka Okoro')).toBe(false);
  });

  it('puts a phone match first, however the number was written', () => {
    expect(phoneKey('+234 803 555 0147')).toBe(phoneKey('0803 555 0147'));

    const [match] = findLikelyMatches(registering({ ageYears: 40, phone: '2348035550147' }), [amaka], NOW);
    expect(match.reasons).toContain('phone');
  });

  /** Families often share one phone: a mother registering her daughter is not a duplicate. */
  it('does not treat a shared phone with a different name as the same person', () => {
    const daughter = registering({ fullName: 'Chioma Okoro', ageYears: 6, phone: '0803 555 0147' });

    expect(findLikelyMatches(daughter, [amaka, mother], NOW)).toEqual([]);
  });

  it('does not match someone of the other sex or a different age', () => {
    expect(findLikelyMatches(registering({ sex: 'male' }), [amaka], NOW)).toEqual([]);
    expect(findLikelyMatches(registering({ ageYears: 60 }), [amaka], NOW)).toEqual([]);
  });

  it('ages a patient registered by age, and uses the date of birth when there is one', () => {
    expect(currentAge({ ageYears: 30, createdOn: '2023-10-01T00:00:00Z' }, NOW)).toBe(33);
    expect(currentAge({ dateOfBirth: '1990-01-01', ageYears: 99, createdOn: '2026-01-01T00:00:00Z' }, NOW)).toBe(36);
  });
});

describe('patient search', () => {
  const everyone = [amaka, mother, ibrahim];

  it('finds "patient 47" by the number staff say aloud', () => {
    expect(searchPatients(everyone, '47', 'OOE-PHC')).toEqual([amaka]);
  });

  it('finds a full Patient ID typed in lower case', () => {
    expect(searchPatients(everyone, 'ooe-phc-000231-t4', 'OOE-PHC')[0]).toBe(ibrahim);
  });

  it('finds by phone digits and by the start of each name while typing', () => {
    expect(searchPatients(everyone, '0805 111', 'OOE-PHC')).toEqual([ibrahim]);
    expect(searchPatients(everyone, 'oko', 'OOE-PHC')).toEqual([amaka, mother]);
    expect(searchPatients(everyone, 'ama oko', 'OOE-PHC')).toEqual([amaka]);
  });

  it('lists the most recently registered first when nothing is typed', () => {
    expect(searchPatients(everyone, '  ', 'OOE-PHC').map((found) => found.fullName)).toEqual(['Amaka Okoro', 'Ibrahim Musa', 'Ngozi Okoro']);
  });
});
