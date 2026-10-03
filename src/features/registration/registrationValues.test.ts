import { describe, expect, it } from 'vitest';
import { EMPTY_REGISTRATION, fromPatient, toPatientDetails } from './registrationValues';

describe('registration values', () => {
  it('trims what was typed and leaves blanks out, so nothing unasked is recorded', () => {
    const details = toPatientDetails({
      ...EMPTY_REGISTRATION,
      fullName: '  Amaka Okoro ',
      address: 'Odo-Ona ',
      sex: 'F',
      age: '32',
      phone: '   ',
    });

    expect(details).toEqual({ fullName: 'Amaka Okoro', address: 'Odo-Ona', sex: 'female', ageYears: 32 });
  });

  it('keeps the paper folder number as the legacy reference (PRD §10.2)', () => {
    expect(toPatientDetails({ ...EMPTY_REGISTRATION, folder: '2023/1187' }).legacyPaperRef).toBe('2023/1187');
  });

  it('round-trips a registered patient through the form', () => {
    const values = { ...EMPTY_REGISTRATION, fullName: 'Tunde', address: 'Ring Road', sex: 'M' as const, dateOfBirth: '1980-01-01', religion: 'islam' as const };
    const details = toPatientDetails(values);

    const patient = { ...details, id: 'x', type: 'patient' as const, patientId: 'OOE-000001-AB', facilityId: 'OOE', schemaVersion: 3, createdBy: 's', createdOn: '2026-01-01T00:00:00Z', deviceId: 'd', dobEstimated: false, allergies: [] };
    expect(fromPatient(patient)).toEqual(values);
  });
});
