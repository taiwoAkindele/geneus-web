import type { BillingAdjustment, Charge, Payment } from '@shared';
import { chargeBalances } from '@/data/repos/billing';

export const billingRows = (charges: readonly Charge[], payments: readonly Payment[], adjustments: readonly BillingAdjustment[]) =>
  chargeBalances(charges, payments, adjustments).map((row) => {
    const receipts = payments.filter((p) => p.allocations.some((a) => a.chargeId === row.charge.id));
    const reasons = adjustments.filter((a) => a.chargeId === row.charge.id).map((a) => a.reason);
    return { ...row, receipts, reasons, status: row.balanceMinor <= 0 ? 'Settled' : row.settledMinor > 0 ? 'Part paid' : 'Unpaid' };
  });

export const transferAllocated = (id: string, payments: readonly Payment[]) => payments
  .filter((p) => p.incomingTransferId === id)
  .reduce((n, p) => n + (p.reverses ? -1 : 1) * p.amountMinor, 0);

export const totalsFor = (rows: ReturnType<typeof billingRows>) => rows.reduce((n, r) => ({
  original: n.original + r.charge.listPriceMinor,
  exempt: n.exempt + (r.charge.exemptionReason ? r.charge.listPriceMinor : 0),
  discounted: n.discounted + r.discountMinor, waived: n.waived + r.waivedMinor,
  collected: n.collected + r.receipts.filter((p) => p.method !== 'waiver').reduce((v, p) => v +
    (p.reverses ? -1 : 1) * p.allocations.filter((a) => a.chargeId === r.charge.id).reduce((s, a) => s + a.amountMinor, 0), 0),
  outstanding: n.outstanding + Math.max(0, r.balanceMinor),
}), { original: 0, exempt: 0, discounted: 0, waived: 0, collected: 0, outstanding: 0 });
