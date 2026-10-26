import type { IncomingTransfer } from '@shared';
import type { ChargeBalance } from '@/data/repos/billing';
import { MAX_AMOUNT_MINOR, parseAmount } from '@/lib/money';

export class PaymentInputError extends Error {
  constructor(message: string, readonly chargeId?: string) { super(message); }
}

export const preparePayment = (rows: readonly ChargeBalance[], amounts: Readonly<Record<string, string>>, transfer?: IncomingTransfer, available?: number) => {
  const selected = rows.filter((row) => amounts[row.charge.id]?.trim());
  if (!selected.length) throw new PaymentInputError('Enter an amount against at least one unpaid fee.');
  const currency = selected[0].charge.currency;
  const allocations = selected.map((row) => {
    try {
      if (row.charge.currency !== currency) throw new Error('Collect one currency at a time.');
      if (transfer && (transfer.currency !== currency || transfer.mode !== 'live' || (transfer.departmentId && transfer.departmentId !== row.charge.departmentId))) throw new Error('Choose fees belonging to this transfer’s currency and department.');
      const amountMinor = parseAmount(amounts[row.charge.id], currency);
      if (amountMinor <= 0 || amountMinor > row.balanceMinor) throw new Error('Enter an amount greater than zero and no more than the unpaid balance.');
      return { chargeId: row.charge.id, amountMinor };
    } catch (cause) {
      throw new PaymentInputError(`${row.charge.description}: ${cause instanceof Error ? cause.message : 'Check the amount.'}`, row.charge.id);
    }
  });
  const amountMinor = allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0);
  if (!Number.isSafeInteger(amountMinor) || amountMinor > MAX_AMOUNT_MINOR) throw new PaymentInputError('The total exceeds the supported payment range.');
  if (transfer && available !== undefined && amountMinor > available) throw new PaymentInputError('The allocation exceeds the amount left on this transfer.');
  return { currency, allocations, amountMinor };
};
