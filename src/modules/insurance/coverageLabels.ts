import type { CoverageEstimate, UndeterminedReason } from '@shared';

/** What staff read for each reason a charge's insurance is undecided, and what resolves it. */
export const UNDETERMINED: Record<UndeterminedReason, { label: string; next: string }> = {
  cover_not_checked: { label: 'Cover not checked', next: 'Record a cover check for the date of service.' },
  check_pending: { label: 'Cover check pending', next: 'Record the result when the payer answers.' },
  not_eligible: { label: 'Not eligible on the date of service', next: 'The patient may choose to pay, or the insurance officer reviews it.' },
  choose_cover: { label: 'More than one cover applies', next: 'Choose which cover applies to this visit.' },
  not_configured: { label: 'Not configured in the contract', next: 'The insurance officer adds this service to the contract.' },
  unsupported_arrangement: { label: 'Payment term Geneus cannot calculate yet', next: 'The insurance officer reviews it by hand.' },
  quantity_unavailable: { label: 'Quantity not available on this device', next: 'Sync, then review again.' },
  not_billable_to_patient: { label: 'Excluded, and the contract does not allow billing the patient', next: 'The insurance officer reviews it.' },
  exclusion_liability_not_configured: { label: 'Excluded; who pays is not recorded in the contract', next: 'The insurance officer records the contract rule.' },
  excluded_patient_pays: { label: 'Excluded; the patient pays', next: '' },
  facility_timezone_missing: { label: "Hospital time zone not recorded", next: 'An administrator records the time zone.' },
  self_pay_not_permitted: { label: 'Self-pay choice not permitted by the contract on this date', next: 'The insurance officer reviews it.' },
};

export const coverageLine = (estimate: CoverageEstimate | undefined): { label: string; tone: 'neutral' | 'info' | 'warn'; next?: string } | undefined => {
  if (!estimate) return undefined;
  switch (estimate.state) {
    case 'self_pay': case 'exempt': return undefined;
    case 'estimated': return { label: `Insurance estimate · ${estimate.schedule.planName}`, tone: 'info', next: estimate.line.approvalRequired ? 'This service needs the payer’s approval.' : undefined };
    case 'finalised': return { label: 'Insurance confirmed', tone: 'neutral' };
    case 'self_pay_confirmed': return { label: 'Paying without insurance · confirmed', tone: 'neutral' };
    case 'self_pay_elected': return { label: 'Patient chose to pay without insurance', tone: 'neutral' };
    case 'not_covered': return { label: 'Not covered by the plan · patient pays', tone: 'neutral' };
    case 'undetermined': return { label: UNDETERMINED[estimate.reason].label, tone: 'warn', next: UNDETERMINED[estimate.reason].next };
  }
};

export const CHECK_METHODS = [
  { value: 'portal', label: 'Payer portal' }, { value: 'phone', label: 'Phone call' }, { value: 'email', label: 'Email' },
  { value: 'card_seen', label: 'Card seen' }, { value: 'letter', label: 'Letter' }, { value: 'other', label: 'Other' },
] as const;
export const CHECK_RESULTS = [
  { value: 'verified', label: 'Verified — cover is active' }, { value: 'pending', label: 'Pending — waiting for the payer' }, { value: 'not_eligible', label: 'Not eligible' },
] as const;
