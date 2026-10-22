import { FeeItem, type ChargeWhen, type ExemptionRule, type FeeCategory, type VisitType } from '@shared';
import type { FeeDraft } from '@/data/repos/billing';
import { amountInput, parseAmount } from '@/lib/money';

export const CATEGORY_LABELS: Record<FeeCategory, string> = {
  registration: 'Registration', card: 'Patient card', consultation: 'Consultation',
  laboratory: 'Laboratory', procedure: 'Procedure', other: 'Other',
};
export const CHARGE_WHEN_LABELS: Record<ChargeWhen, string> = {
  first_visit: 'First visit only', every_visit: 'Every visit', when_ordered: 'When ordered',
};
export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  general: 'General', follow_up: 'Follow-up', antenatal: 'Antenatal', postnatal: 'Postnatal',
  delivery: 'Delivery', immunisation: 'Immunisation', family_planning: 'Family planning',
  child_welfare: 'Child welfare', tb_programme: 'TB programme', hiv_programme: 'HIV programme', emergency: 'Emergency',
};

export type RuleForm = {
  reason: string;
  ageUnderYears: string;
  ageFromYears: string;
  sex: '' | ExemptionRule['sex'];
  visitTypes: VisitType[];
};
export type FeeForm = {
  name: string;
  category: FeeCategory;
  amount: string;
  currency: string;
  chargeWhen: ChargeWhen;
  exemptions: RuleForm[];
};

export const emptyRule = (): RuleForm => ({ reason: '', ageUnderYears: '', ageFromYears: '', sex: '', visitTypes: [] });

export const feeFormValues = (fee?: FeeItem, currency = ''): FeeForm => ({
  name: fee?.name ?? '',
  category: fee?.category ?? 'consultation',
  amount: fee ? amountInput(fee.amountMinor, fee.currency) : '',
  currency: fee?.currency ?? currency,
  chargeWhen: fee?.chargeWhen ?? 'every_visit',
  exemptions: fee?.exemptions.map((rule) => ({
    reason: rule.reason,
    ageUnderYears: rule.ageUnderYears === undefined ? '' : String(rule.ageUnderYears),
    ageFromYears: rule.ageFromYears === undefined ? '' : String(rule.ageFromYears),
    sex: rule.sex ?? '',
    visitTypes: rule.visitTypes ?? [],
  })) ?? [],
});

const draftSchema = FeeItem.pick({ name: true, category: true, amountMinor: true, currency: true, chargeWhen: true, exemptions: true });

/** Forms hold strings; the shared schema remains the authority for the saved shape. */
export const feeDraftFromForm = (form: FeeForm): FeeDraft => {
  const currency = form.currency.trim().toUpperCase();
  const result = draftSchema.safeParse({
    name: form.name.trim(),
    category: form.category,
    amountMinor: parseAmount(form.amount, currency),
    currency,
    chargeWhen: form.chargeWhen,
    exemptions: form.exemptions.map((rule) => ({
      reason: rule.reason.trim(),
      ageUnderYears: rule.ageUnderYears.trim() === '' ? undefined : Number(rule.ageUnderYears),
      ageFromYears: rule.ageFromYears.trim() === '' ? undefined : Number(rule.ageFromYears),
      sex: rule.sex || undefined,
      visitTypes: rule.visitTypes.length > 0 ? rule.visitTypes : undefined,
    })),
  });
  if (!result.success) {
    throw new Error(result.error.issues.map((issue) => {
      const rule = issue.path[0] === 'exemptions' && typeof issue.path[1] === 'number' ? `Exemption ${issue.path[1] + 1}: ` : '';
      return `${rule}${issue.message}`;
    }).join('. '));
  }
  return result.data;
};
