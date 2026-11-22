import {
  FeeItem,
  type ChargeWhen,
  type ExemptionRule,
  type FeeCategory,
  type VisitType,
} from '@shared';
import type { FeeDraft } from '@/data/repos/billing';
import { amountInput, parseAmount } from '@/lib/money';

export const CATEGORY_LABELS: Record<FeeCategory, string> = {
  pharmacy: 'Pharmacy',
  maternity: 'Maternity',
  admission: 'Admission / Accommodation',
  imaging: 'Imaging',
  registration: 'Registration',
  card: 'Patient card',
  consultation: 'Consultation',
  laboratory: 'Laboratory',
  procedure: 'Procedure',
  other: 'General / Other',
};
export const CHARGE_WHEN_LABELS: Record<ChargeWhen, string> = {
  first_visit: 'First visit only',
  every_visit: 'Every visit',
  when_ordered: 'Only when selected',
};
export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  general: 'General',
  follow_up: 'Follow-up',
  antenatal: 'Antenatal',
  postnatal: 'Postnatal',
  delivery: 'Delivery',
  immunisation: 'Immunisation',
  family_planning: 'Family planning',
  child_welfare: 'Child welfare',
  tb_programme: 'TB programme',
  hiv_programme: 'HIV programme',
  emergency: 'Emergency',
};

export type RuleForm = {
  reason: string;
  ageUnderYears: string;
  ageFromYears: string;
  sex: '' | ExemptionRule['sex'];
  visitTypes: VisitType[];
};
export type FeeForm = {
  description?: string;
  name: string;
  category: FeeCategory;
  amount: string;
};
export type FeePolicyForm = {
  chargeWhen: ChargeWhen;
  exemptions: RuleForm[];
};

export const EXEMPTION_PRESETS: { label: string; rule: RuleForm }[] = [
  {
    label: 'Under 5',
    rule: {
      reason: 'Under-5 policy',
      ageUnderYears: '5',
      ageFromYears: '',
      sex: '',
      visitTypes: [],
    },
  },
  {
    label: 'Antenatal visits',
    rule: {
      reason: 'Antenatal policy',
      ageUnderYears: '',
      ageFromYears: '',
      sex: '',
      visitTypes: ['antenatal'],
    },
  },
  {
    label: 'Immunisation',
    rule: {
      reason: 'Immunisation programme',
      ageUnderYears: '',
      ageFromYears: '',
      sex: '',
      visitTypes: ['immunisation'],
    },
  },
];

export const FEE_CURRENCIES = [
  { value: 'NGN', label: 'Nigerian naira (NGN)' },
  { value: 'GHS', label: 'Ghanaian cedi (GHS)' },
  { value: 'KES', label: 'Kenyan shilling (KES)' },
  { value: 'ZAR', label: 'South African rand (ZAR)' },
  { value: 'USD', label: 'US dollar (USD)' },
  { value: 'GBP', label: 'British pound (GBP)' },
  { value: 'EUR', label: 'Euro (EUR)' },
];

export const emptyRule = (): RuleForm => ({
  reason: '',
  ageUnderYears: '',
  ageFromYears: '',
  sex: '',
  visitTypes: [],
});

export const feeFormValues = (fee?: FeeItem): FeeForm => ({
  name: fee?.name ?? '',
  description: fee?.description ?? '',
  category: fee?.category ?? 'consultation',
  amount: fee ? amountInput(fee.amountMinor, fee.currency) : '',
});

export const feePolicyValues = (fee: FeeItem): FeePolicyForm => ({
  chargeWhen: fee.chargeWhen,
  exemptions: fee.exemptions.map((rule) => ({
    reason: rule.reason,
    ageUnderYears: rule.ageUnderYears === undefined ? '' : String(rule.ageUnderYears),
    ageFromYears: rule.ageFromYears === undefined ? '' : String(rule.ageFromYears),
    sex: rule.sex ?? '',
    visitTypes: rule.visitTypes ?? [],
  })),
});

const draftSchema = FeeItem.pick({
  description: true,
  name: true,
  category: true,
  departmentId: true,
  amountMinor: true,
  currency: true,
  chargeWhen: true,
  exemptions: true,
});

/** Forms hold strings; the shared schema remains the authority for the saved shape. */
export const feeDraftFromForm = (form: FeeForm, currencyCode = 'NGN'): FeeDraft => {
  const currency = currencyCode.trim().toUpperCase();
  const result = draftSchema.safeParse({
    name: form.name.trim(),
    description: form.description?.trim() || undefined,
    category: form.category,
    departmentId: null,
    amountMinor: parseAmount(form.amount, currency),
    currency,
    chargeWhen: 'when_ordered',
    exemptions: [],
  });
  if (!result.success) {
    throw new Error(result.error.issues.map((issue) => issue.message).join('. '));
  }
  return result.data;
};

export const feePolicyFromForm = (
  form: FeePolicyForm,
): Pick<FeeItem, 'chargeWhen' | 'exemptions'> => {
  const result = FeeItem.pick({ chargeWhen: true, exemptions: true }).safeParse({
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
    throw new Error(
      result.error.issues
        .map((issue) => {
          const rule =
            issue.path[0] === 'exemptions' && typeof issue.path[1] === 'number'
              ? `Exemption ${issue.path[1] + 1}: `
              : '';
          return `${rule}${issue.message}`;
        })
        .join('. '),
    );
  }
  return result.data;
};
