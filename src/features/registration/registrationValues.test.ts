import { describe, expect, it } from 'vitest';
import { EMPTY_REGISTRATION, fromPatient, toPatientDetails } from './registrationValues';

describe('registration values', () => {
  it('requires an explicit sex choice instead of recording a default', () => {
    expect(EMPTY_REGISTRATION.sex).toBe('');
    expect(() => toPatientDetails(EMPTY_REGISTRATION)).toThrow(/Choose/);
  });
  it('trims what was typed and leaves blanks out, so nothing unasked is recorded', () => {
    const details = toPatientDetails({
      ...EMPTY_REGISTRATION,
      fullName: '  Amaka Okoro ',
      address: 'Odo-Ona ',
      sex: 'F',
      age: '32',
      phone: '   ',
    });

    expect(details).toEqual({ fullName: 'Amaka Okoro', address: 'Odo-Ona', sex: 'female', ageYears: 32, ageObservedOn: new Date().toISOString().slice(0, 10), dobEstimated: true, identityEvidence: 'reported' });
  });

  it('keeps the paper folder number as the legacy reference (PRD §10.2)', () => {
    expect(toPatientDetails({ ...EMPTY_REGISTRATION, sex: 'F', folder: '2023/1187' }).legacyPaperRef).toBe('2023/1187');
  });

  it('validates optional NIN and distinguishes document checks from reported identity', () => {
    const values = { ...EMPTY_REGISTRATION, sex: 'F' as const, age: '20', nin: '123 456 78901' };
    expect(toPatientDetails(values).nin).toBe('12345678901');
    expect(() => toPatientDetails({ ...values, nin: '123' })).toThrow(/11 digits/);
    expect(() => toPatientDetails({ ...values, identityEvidence: 'document_seen' })).toThrow(/document checked/);
    expect(toPatientDetails({ ...values, identityEvidence: 'document_seen', identityEvidenceNote: 'Paper identity card, name and birth date checked' }).identityEvidence).toBe('document_seen');
  });
  it('refuses contradictory birth dates and ages before saving', () => {
    expect(() => toPatientDetails({ ...EMPTY_REGISTRATION, sex: 'M', age: '2', dateOfBirth: '1980-01-01' })).toThrow(/do not agree/);
  });

  it('round-trips a registered patient through the form', () => {
    const values = { ...EMPTY_REGISTRATION, fullName: 'Tunde', address: 'Ring Road', sex: 'M' as const, dateOfBirth: '1980-01-01', religion: 'islam' as const };
    const details = toPatientDetails(values);

    const patient = { ...details, id: 'x', type: 'patient' as const, patientId: 'OOE-000001-AB', facilityId: 'OOE', schemaVersion: 3, createdBy: 's', createdOn: '2026-01-01T00:00:00Z', deviceId: 'd', dobEstimated: false, allergies: [] };
    expect(fromPatient(patient)).toEqual(values);
  });
});
