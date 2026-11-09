import { describe, expect, it } from 'vitest';
import { Patient } from '@shared';
import { compareIdentities } from './identityComparison';

const now = Date.parse('2026-11-09T10:00:00Z');
const base = { type: 'patient', facilityId: 'OOE-PHC', schemaVersion: 5, createdBy: 'staff:records', createdOn: '2026-06-20T09:00:00Z', deviceId: 'device-1', ageObservedOn: '2026-06-20' };
const patient = (id: string, over: Record<string, unknown>) => Patient.parse({ ...base, id, patientId: id, fullName: 'X', sex: 'female', ageYears: 34, address: 'Test road', ...over });

const bisi = patient('OOE-PHC-000048-AB', { fullName: 'Bisi Adeyemi', phone: '0706 228 9013', dateOfBirth: '1992-07-02', ageYears: 33, address: 'Bodija, Ibadan' });
const bisola = patient('OOE-PHC-000049-C5', { fullName: 'Bisi Adeyemi', phone: '+234 706 228 9013', dateOfBirth: '1992-07-02', ageYears: 33, address: 'Bodija Market Rd' });
const agreement = (rows: ReturnType<typeof compareIdentities>) => Object.fromEntries(rows.map((row) => [row.label, row.agreement]));

describe('identity comparison', () => {
  it('treats one phone written two ways as the same, and an address written differently as different', () => {
    const rows = agreement(compareIdentities(bisi, bisola, now));
    expect(rows).toMatchObject({ Name: 'match', Sex: 'match', 'Birth date': 'match', Phone: 'match', Address: 'differs' });
  });

  it('never calls a detail missing on either record a match or a difference', () => {
    const rows = agreement(compareIdentities(bisi, patient('OOE-PHC-000050-M3', { fullName: 'Bisi Adeyemi' }), now));
    expect(rows).toMatchObject({ Phone: 'unknown', 'Birth date': 'unknown', 'Old folder': 'unknown', NIN: 'unknown', Identity: 'unknown' });
  });

  it('uses the duplicate check name rule and a two-year age tolerance', () => {
    const rows = agreement(compareIdentities(patient('OOE-PHC-000001-K2', { fullName: 'Amaka Okoro', ageYears: 35 }), patient('OOE-PHC-000002-K2', { fullName: 'Okoro Ammaka', ageYears: 37 }), now));
    expect(rows).toMatchObject({ Name: 'match', Age: 'match' });
    expect(agreement(compareIdentities(patient('OOE-PHC-000001-K2', { ageYears: 30 }), patient('OOE-PHC-000002-K2', { ageYears: 40 }), now)).Age).toBe('differs');
  });

  it('masks NIN digits other than the last four', () => {
    const [nin] = compareIdentities(patient('OOE-PHC-000001-K2', { nin: '12345678901' }), patient('OOE-PHC-000002-K2', {}), now).filter((row) => row.label === 'NIN');
    expect(nin.first).toBe('•••••••8901');
    expect(nin.second).toBe('Not recorded');
  });
});
