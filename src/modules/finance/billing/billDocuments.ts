import { billKey, billReference, type Payment, type IncomingTransfer, type Refund } from '@shared';
import { billingRows } from './ledger';
import type { BillingData } from './useBilling';

/** The bill rules are shared with the server, so the patient's link names the same bill and reference. */
export { billKey, billReference };
export const billDocuments = (data: BillingData) => {
  const groups = new Map<string, ReturnType<typeof billingRows>>();
  for (const row of billingRows(data.charges, data.payments, data.adjustments, data.coverage)) {
    const key = billKey(row.charge);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups].map(([id, rows]) => ({ id, reference: billReference(id), rows,
    patientId: rows[0].charge.patientId, currency: rows[0].charge.currency,
    createdOn: rows.map(r => r.charge.createdOn).sort()[0],
    original: rows.reduce((n,r) => n+r.charge.listPriceMinor,0),
    due: rows.reduce((n,r) => n+Math.max(0,r.balanceMinor),0),
    credit: rows.reduce((n,r) => n+Math.max(0,-r.balanceMinor),0),
    pending: rows.reduce((n,r) => n+r.undeterminedMinor,0),
    paid: rows.reduce((n,r) => n+r.settledMinor,0),
  })).map(b => ({...b, status: b.pending ? 'Awaiting insurance' : b.due ? b.paid>0?'Part paid':'Unpaid' : b.credit?'Credit':'Paid'}))
    .sort((a,b) => b.createdOn.localeCompare(a.createdOn)||a.id.localeCompare(b.id));
};
export type BillDocument = ReturnType<typeof billDocuments>[number];

/** An incoming bank source is one row; its patient receipts are evidence beneath it. */
export const paymentDocuments = (payments: readonly Payment[], transfers: readonly IncomingTransfer[], refunds: readonly Refund[] = []) => {
  const sources = new Set(transfers.map(t => t.id));
  return [
    ...transfers.map(transfer => ({id: transfer.id, at: transfer.receivedOn, currency: transfer.currency, amount: transfer.amountMinor,
      method:'Bank transfer', reference:transfer.providerReference, transfer, refund:undefined,
      receipts:payments.filter(p=>p.incomingTransferId===transfer.id)})),
    ...payments.filter(p=>!p.incomingTransferId||!sources.has(p.incomingTransferId)).map(payment=>({id:payment.id,at:payment.createdOn,currency:payment.currency,
      amount:payment.reverses?-payment.amountMinor:payment.amountMinor,method:payment.method==='cash'?'Cash':payment.method==='waiver'?'Waiver':payment.method,
      reference:payment.receiptNumber,transfer:undefined,refund:undefined,receipts:[payment]})),
    ...refunds.map(refund=>({id:refund.id,at:refund.createdOn,currency:refund.currency,amount:-refund.amountMinor,
      method:`Refund (${refund.method})`,reference:refund.refundNumber,transfer:undefined,refund,receipts:[] as Payment[]})),
  ].sort((a,b)=>b.at.localeCompare(a.at)||a.id.localeCompare(b.id));
};

/**
 * Payment history: completed payments only. Each patient payment (cash, a bank transfer
 * applied to a bill, a reversal or a legacy waiver) and each refund is one row with its receipt.
 * An incoming bank transfer is not itself a row; its applied parts appear as patient payments.
 */
export const historyDocuments = (payments: readonly Payment[], refunds: readonly Refund[] = []) => [
  ...payments.map(payment => ({ id: payment.id, at: payment.createdOn, currency: payment.currency, patientId: payment.patientId,
    amount: payment.reverses ? -payment.amountMinor : payment.amountMinor,
    kind: (payment.reverses ? 'reversal' : payment.method === 'waiver' ? 'waiver' : payment.method === 'cash' ? 'cash' : 'bank') as 'cash' | 'bank' | 'reversal' | 'waiver' | 'refund',
    method: payment.reverses ? 'Reversal' : payment.method === 'cash' ? 'Cash' : payment.method === 'waiver' ? 'Waiver' : payment.method === 'transfer' ? 'Bank transfer' : payment.method === 'online' ? 'Paid online' : payment.method,
    reference: payment.receiptNumber, chargeIds: payment.allocations.map(a => a.chargeId), payment, refund: undefined as Refund | undefined })),
  ...refunds.map(refund => ({ id: refund.id, at: refund.createdOn, currency: refund.currency, patientId: refund.patientId, amount: -refund.amountMinor,
    kind: 'refund' as const, method: `Refund · ${refund.method}`, reference: refund.refundNumber, chargeIds: refund.allocations.map(a => a.chargeId),
    payment: undefined as Payment | undefined, refund })),
].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
export type HistoryDocument = ReturnType<typeof historyDocuments>[number];

/** Live verified transfers with money this device has not yet seen applied to a bill. The server rechecks capacity. */
export const unlinkedTransfers = (transfers: readonly IncomingTransfer[], payments: readonly Payment[]) => transfers
  .filter(t => t.mode === 'live')
  .map(t => ({ transfer: t, applied: payments.filter(p => p.incomingTransferId === t.id).reduce((n, p) => n + (p.reverses ? -1 : 1) * p.amountMinor, 0) }))
  .filter(t => t.applied < t.transfer.amountMinor)
  .sort((a, b) => b.transfer.receivedOn.localeCompare(a.transfer.receivedOn));
