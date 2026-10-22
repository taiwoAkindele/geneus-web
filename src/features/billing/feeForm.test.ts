import { describe, expect, it } from 'vitest';
import { emptyRule, feeDraftFromForm, feeFormValues, type FeeForm } from './feeForm';

const form = (): FeeForm => ({ ...feeFormValues(), name: ' Consultation ', amount: '1500.29', currency: 'ngn' });

describe('fee schedule form', () => {
  it('normalizes money and optional rule fields into the shared shape', () => {
    const values = form();
    values.exemptions = [{ ...emptyRule(), reason: ' Under-5 ', ageUnderYears: '5' }];
    expect(feeDraftFromForm(values)).toMatchObject({
      name: 'Consultation', amountMinor: 150029, currency: 'NGN',
      exemptions: [{ reason: 'Under-5', ageUnderYears: 5, ageFromYears: undefined, visitTypes: undefined }],
    });
  });

  it('keeps age zero as a condition, while an empty value means no condition', () => {
    const values = form();
    values.exemptions = [{ ...emptyRule(), reason: 'Children', ageFromYears: '0', ageUnderYears: '5' }];
    expect(feeDraftFromForm(values).exemptions[0].ageFromYears).toBe(0);
  });

  it('explains which rule has no conditions or an impossible age range', () => {
    const values = form();
    values.exemptions = [{ ...emptyRule(), reason: 'Policy' }];
    expect(() => feeDraftFromForm(values)).toThrow(/Exemption 1: An exemption needs at least one condition/);
    values.exemptions[0] = { ...emptyRule(), reason: 'Policy', ageFromYears: '10', ageUnderYears: '5' };
    expect(() => feeDraftFromForm(values)).toThrow(/Exemption 1: No patient/);
  });
});
