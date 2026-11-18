import { describe, expect, it } from 'vitest';
import { emptyRule, EXEMPTION_PRESETS, feePolicyFromForm, type FeePolicyForm } from './feeForm';

describe('separate existing fee policies', () => {
  it('keeps each exemption preset editable and accepted by the shared contract', () => {
    for (const preset of EXEMPTION_PRESETS) expect(feePolicyFromForm({ chargeWhen: 'first_visit', exemptions: [preset.rule] }).exemptions[0].reason).toBe(preset.rule.reason);
  });
  it('normalizes optional fields while preserving age zero and automatic charging', () => {
    const form: FeePolicyForm = { chargeWhen: 'every_visit', exemptions: [{ ...emptyRule(), reason: ' Children ', ageFromYears: '0', ageUnderYears: '5' }] };
    expect(feePolicyFromForm(form)).toMatchObject({ chargeWhen: 'every_visit', exemptions: [{ reason: 'Children', ageFromYears: 0, ageUnderYears: 5 }] });
    expect(Object.keys(feePolicyFromForm(form)).sort()).toEqual(['chargeWhen', 'exemptions']);
  });
  it('identifies an invalid rule without silently dropping it', () => {
    const form: FeePolicyForm = { chargeWhen: 'when_ordered', exemptions: [{ ...emptyRule(), reason: 'Policy' }] };
    expect(() => feePolicyFromForm(form)).toThrow(/Exemption 1: An exemption needs at least one condition/);
    form.exemptions[0] = { ...emptyRule(), reason: 'Policy', ageFromYears: '10', ageUnderYears: '5' };
    expect(() => feePolicyFromForm(form)).toThrow(/Exemption 1: No patient/);
  });
});
