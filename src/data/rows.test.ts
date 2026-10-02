import { describe, expect, it } from 'vitest';
import type { Patient, StockItem } from '@shared';
import { fieldKindsFor } from './contractShape';
import { decodeValues, fromRow, toRow } from './rows';

/**
 * A row exactly as PowerSync delivered it in the Phase D stack test: booleans
 * as 1/0, numerics as strings, lists as JSON text, absent columns as null,
 * timestamps with microseconds. The mapping has to turn that back into a
 * record the contract accepts, and turn a record into a row SQLite stores.
 */
const wirePatient = {
  id: 'DUMP-V5P2-000001-K2',
  facilityId: 'DUMP-V5P2',
  schemaVersion: 3,
  createdBy: 'staff:a38cd12b',
  createdOn: '2026-09-12T15:45:33.570000Z',
  deviceId: 'device-DUMP-V5P2',
  updatedBy: null,
  updatedOn: null,
  patientId: 'DUMP-V5P2-000001-K2',
  fullName: 'Dump',
  address: 'X',
  sex: 'female',
  dateOfBirth: '1994-03-08',
  dobEstimated: 1,
  ageYears: 32,
  occupation: null,
  religion: null,
  allergies: '["a","b"]',
  phone: null,
  nin: null,
  legacyPaperRef: null,
};

describe('field kinds', () => {
  it('reads booleans, numbers and lists off the contract', () => {
    const kinds = fieldKindsFor('patient');
    expect(kinds.dobEstimated).toBe('boolean');
    expect(kinds.ageYears).toBe('number');
    expect(kinds.allergies).toBe('json');
    expect(kinds.fullName).toBe('text');
    expect(kinds.type).toBeUndefined();
    expect(fieldKindsFor('register_definition').fields).toBe('json');
    expect(fieldKindsFor('stock_item').quantityOnHand).toBe('number');
  });
});

describe('fromRow', () => {
  it('turns a synced row back into a contract record', () => {
    const patient = fromRow<Patient>('patient', wirePatient);

    expect(patient.type).toBe('patient');
    expect(patient.dobEstimated).toBe(true);
    expect(patient.allergies).toEqual(['a', 'b']);
    expect(patient.occupation).toBeUndefined();
    expect('updatedBy' in patient).toBe(false);
  });

  it("leaves PowerSync's own _metadata column out of the record", () => {
    const patient = fromRow<Patient>('patient', { ...wirePatient, _metadata: 'staff:nurse' });
    expect('_metadata' in patient).toBe(false);
  });

  it('coerces the string a numeric column arrives as', () => {
    const item = fromRow<StockItem>('stock_item', {
      id: 'stock_item:x',
      facilityId: 'F',
      schemaVersion: 3,
      createdBy: 's',
      createdOn: '2026-09-12T15:45:33.588000Z',
      deviceId: 'd',
      name: 'ACT',
      category: 'drug',
      unitOfMeasure: null,
      quantityOnHand: '12.5',
      reorderLevel: '3',
    });

    expect(item.quantityOnHand).toBe(12.5);
    expect(item.reorderLevel).toBe(3);
  });
});

describe('toRow', () => {
  it('stores booleans as integers, lists as JSON text and absence as NULL', () => {
    const row = toRow('patient', {
      type: 'patient',
      id: 'X-Y-000001-K2',
      dobEstimated: false,
      allergies: ['penicillin'],
      phone: undefined,
      ageYears: 32,
    });

    expect(row).toEqual({ id: 'X-Y-000001-K2', dobEstimated: 0, allergies: '["penicillin"]', phone: null, ageYears: 32 });
    expect('type' in row).toBe(false);
  });

  it('round-trips through decodeValues', () => {
    const record = { id: 'r:1', fields: [{ id: 'f1', type: 'text', label: 'Name' }], version: 2, status: 'published' };
    expect(decodeValues('register_definition', toRow('register_definition', record))).toEqual(record);
  });
});
