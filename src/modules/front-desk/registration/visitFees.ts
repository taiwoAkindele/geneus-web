import { findExemption, validCalendarDate, yearsBetween, type ExemptionFacts, type FeeItem, type VisitType } from '@shared';
import { VISIT_TYPE_LABELS } from '@/modules/finance/billing/feeForm';
import { formatMoney } from '@/lib/money';
import { parseAge, type RegistrationValues } from './registrationValues';

/** A visit booked in the same save as the registration ("Register & send on"). */
export type RegistrationVisit = { visitType: VisitType; reason: string };

export const visitFor = (visitType: VisitType): RegistrationVisit => ({ visitType, reason: visitType === 'general' ? 'Consultation' : VISIT_TYPE_LABELS[visitType] });

/** One fee the new patient would be charged, at its price or at zero with the exemption that applies. */
export type FeeLine = { feeId: string; name: string; listPriceMinor: number; amountMinor: number; currency: string; exemptReason?: string };

/** Billing facts from the form as typed. An unknown age or sex never qualifies for an exemption. */
export const factsFromForm = (values: Pick<RegistrationValues, 'sex' | 'age' | 'dateOfBirth'>, visitType?: VisitType, today = new Date().toISOString().slice(0, 10)): ExemptionFacts => {
  const typedAge = parseAge(values.age);
  const ageYears = values.dateOfBirth && validCalendarDate(values.dateOfBirth) && values.dateOfBirth <= today
    ? yearsBetween(values.dateOfBirth, today)
    : typedAge !== undefined && Number.isInteger(typedAge) && typedAge >= 0 ? typedAge : undefined;
  return { ageYears, sex: values.sex === 'F' ? 'female' : values.sex === 'M' ? 'male' : undefined, visitType };
};

/**
 * The fees a brand-new patient is charged by saving the registration, and by
 * a visit booked in the same save. Mirrors registerPatient (first-visit fees
 * that do not depend on the visit type) and booking (every-visit fees and the
 * remaining first-visit fees), so the preview matches what is written.
 */
export const newPatientFees = (fees: readonly FeeItem[], facts: ExemptionFacts, withVisit: boolean): FeeLine[] =>
  fees
    .filter((fee) => fee.active && (fee.chargeWhen === 'first_visit' ? withVisit || !fee.exemptions.some((rule) => rule.visitTypes) : withVisit && fee.chargeWhen === 'every_visit'))
    .map((fee) => {
      const exemption = findExemption(fee.exemptions, withVisit ? facts : { ...facts, visitType: undefined });
      return { feeId: fee.id, name: fee.name, listPriceMinor: fee.amountMinor, amountMinor: exemption ? 0 : fee.amountMinor, currency: fee.currency, exemptReason: exemption?.reason };
    });

/** What is owed, per currency; empty when nothing is owed. */
export const amountsDue = (lines: readonly Pick<FeeLine, 'amountMinor' | 'currency'>[]): string[] => {
  const totals = new Map<string, number>();
  for (const line of lines) if (line.amountMinor > 0) totals.set(line.currency, (totals.get(line.currency) ?? 0) + line.amountMinor);
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => formatMoney(amount, currency));
};
