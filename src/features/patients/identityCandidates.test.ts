import { describe, expect, it } from 'vitest';
import { Patient, type PatientIdentityEvent } from '@shared';
import { identityCandidates, unreviewedIdentityMatches } from './identityCandidates';

const patient = (n: number, name = 'Amaka Okoro', phone = '08035550147') => Patient.parse({ id: `OOE-00000${n}-K2`, patientId: `OOE-00000${n}-K2`, type: 'patient', facilityId: 'OOE', createdBy: 'staff', createdOn: '2026-01-01T00:00:00Z', deviceId: 'device', fullName: name, address: 'Test address', sex: 'female', ageYears: 30, phone });
const first = patient(1), second = patient(2), family = patient(3, 'Chioma Okoro');
const event = (outcome: PatientIdentityEvent['outcome']): PatientIdentityEvent => ({ id: 'review', type: 'patient_identity_event', facilityId: 'OOE', schemaVersion: 3, deviceId: 'device', createdBy: 'staff', createdOn: '2026-01-02T00:00:00Z', patientId: first.id, otherPatientId: second.id, reason: 'Review evidence', revision: 1, outcome });

describe('identity review candidates after synchronisation', () => {
  it('allows identification after confirmed different-person or same-person review without blocking forever', () => {
    expect(unreviewedIdentityMatches(first, first.id, [first, second], [])).toHaveLength(1);
    expect(unreviewedIdentityMatches(first, first.id, [first, second], [event('distinct')])).toEqual([]);
    expect(unreviewedIdentityMatches(first, first.id, [first, second], [event('linked')])).toEqual([]);
    expect(unreviewedIdentityMatches(first, first.id, [first, second], [{ ...event('distinct'), revision: undefined }])).toHaveLength(1);
    expect(unreviewedIdentityMatches(first, first.id, [first, second], [event('distinct'), { ...event('review_requested'), id: 'new-review', revision: 2 }])).toHaveLength(1);
  });
  it('finds a duplicate created on another offline desk, without treating the shared family phone as proof', () => {
    const pairs = identityCandidates([first, second, family], []);
    expect(pairs).toHaveLength(1); expect([pairs[0].patient.id, pairs[0].other.id].sort()).toEqual([first.id, second.id]);
  });
  it('removes confirmed links and different-person decisions from suggestions', () => {
    expect(identityCandidates([first, second], [event('linked')])).toEqual([]);
    expect(identityCandidates([first, second], [event('distinct')])).toEqual([]);
    expect(identityCandidates([first, second], [event('registration_distinct')])).toEqual([]);
  });
  it('retains explicit uncertain cases even when fuzzy demographics no longer match', () => {
    const changed = { ...second, fullName: 'Different Recorded Name', phone: '08012223344', ageYears: 60 };
    expect(identityCandidates([first, changed], [event('review_requested')])[0].reason).toContain('Flagged for review');
  });
});
