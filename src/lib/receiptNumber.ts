import { RECEIPT_NUMBER_RE } from '@shared';
import { formatSequence, MAX_SEQUENCE, randomSafetyCode, sequenceOf } from './patientId';

/** The sequence is local knowledge; the random suffix keeps offline devices apart. */
export const mintReceiptNumber = (facilityCode: string, receipts: readonly string[]): string => {
  const highest = receipts.reduce((max, receipt) => Math.max(max, sequenceOf(receipt, `${facilityCode}-R`) ?? 0), 0);
  if (highest >= MAX_SEQUENCE) throw new Error('This facility has used every receipt number');
  const receipt = `${facilityCode}-R-${formatSequence(highest + 1)}-${randomSafetyCode()}`;
  if (!RECEIPT_NUMBER_RE.test(receipt)) throw new Error('The facility code cannot be used for a receipt');
  return receipt;
};
