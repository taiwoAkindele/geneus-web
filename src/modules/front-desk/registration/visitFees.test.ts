import { describe, expect, it } from 'vitest';
import type { FeeItem } from '@shared';
import { formatMoney } from '@/lib/money';
import { amountsDue, factsFromForm, newPatientFees, visitFor } from './visitFees';

const fee = (over: Partial<FeeItem>): FeeItem => ({
  id: 'fee:x', type: 'fee_item', facilityId: 'OOE-PHC', schemaVersion: 5, createdBy: 'staff:admin', createdOn: '2026-11-01T00:00:00Z', deviceId: 'device-1',
  name: 'Fee', category: 'other', amountMinor: 100000, currency: 'NGN', chargeWhen: 'every_visit', exemptions: [], active: true, ...over,
} as FeeItem);

const registration = fee({ id: 'fee:reg', name: 'Registration', category: 'registration', chargeWhen: 'first_visit', exemptions: [{ reason: 'Under-5 policy', ageUnderYears: 5 }] });
const consultation = fee({ id: 'fee:consult', name: 'Consultation', category: 'consultation', amountMinor: 200000, exemptions: [{ reason: 'Antenatal policy', visitTypes: ['antenatal'] }] });
const antenatalCard = fee({ id: 'fee:anc-card', name: 'ANC card', chargeWhen: 'first_visit', amountMinor: 50000, exemptions: [{ reason: 'Free ANC', visitTypes: ['antenatal'] }] });
const retired = fee({ id: 'fee:old', name: 'Old fee', active: false });
const lab = fee({ id: 'fee:lab', name: 'Malaria RDT', chargeWhen: 'when_ordered' });
const all = [registration, consultation, antenatalCard, retired, lab];

describe('fees previewed for a new patient', () => {
  it('without a visit, charges only first-visit fees that do not depend on the visit type', () => {
    const lines = newPatientFees(all, { ageYears: 30, sex: 'female' }, false);
    expect(lines.map((line) => line.feeId)).toEqual(['fee:reg']);
  });

  it('with a visit, adds every-visit fees and the remaining first-visit fees, never ordered or retired ones', () => {
    const lines = newPatientFees(all, { ageYears: 30, sex: 'female', visitType: 'general' }, true);
    expect(lines.map((line) => line.feeId)).toEqual(['fee:reg', 'fee:consult', 'fee:anc-card']);
    expect(amountsDue(lines)).toEqual([formatMoney(350000, 'NGN')]);
  });

  it('shows exempt fees at zero with the reason, so free care is still visible', () => {
    const lines = newPatientFees(all, { ageYears: 3, sex: 'female', visitType: 'antenatal' }, true);
    expect(lines.every((line) => line.amountMinor === 0)).toBe(true);
    expect(lines.map((line) => line.exemptReason)).toEqual(['Under-5 policy', 'Antenatal policy', 'Free ANC']);
    expect(lines[0].listPriceMinor).toBe(100000);
    expect(amountsDue(lines)).toEqual([]);
  });

  it('never treats an unknown age as qualifying for an age exemption', () => {
    const lines = newPatientFees([registration], factsFromForm({ sex: 'F', age: '', dateOfBirth: '' }), false);
    expect(lines[0].amountMinor).toBe(100000);
  });

  it('works the age out from a birth date first, then from a typed age', () => {
    expect(factsFromForm({ sex: 'M', age: '', dateOfBirth: '2023-05-18' }, undefined, '2026-11-09')).toEqual({ ageYears: 3, sex: 'male', visitType: undefined });
    expect(factsFromForm({ sex: '', age: '41', dateOfBirth: '' }, 'general', '2026-11-09')).toEqual({ ageYears: 41, sex: undefined, visitType: 'general' });
    expect(factsFromForm({ sex: 'F', age: '4.5', dateOfBirth: '' }).ageYears).toBeUndefined();
  });

  it('totals each currency separately', () => {
    expect(amountsDue([{ amountMinor: 100, currency: 'NGN' }, { amountMinor: 0, currency: 'USD' }, { amountMinor: 50, currency: 'NGN' }])).toEqual([formatMoney(150, 'NGN')]);
  });

  it('describes a general visit as a consultation', () => {
    expect(visitFor('general')).toEqual({ visitType: 'general', reason: 'Consultation' });
    expect(visitFor('antenatal')).toEqual({ visitType: 'antenatal', reason: 'Antenatal' });
  });
});
