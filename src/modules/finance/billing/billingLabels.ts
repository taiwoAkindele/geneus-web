import type { BillingData } from './useBilling';

type Adjustment = BillingData['adjustments'][number];

/** What kind of reduction an adjustment is, as staff call it. */
export const adjustmentLabel = (
  adjustment: Pick<Adjustment, 'dispenseEntryId' | 'kind'>,
): string => {
  if (adjustment.dispenseEntryId) {
    return 'Medicine return credit';
  }

  if (adjustment.kind === 'discount') {
    return 'Discount';
  }

  return 'Waiver';
};
