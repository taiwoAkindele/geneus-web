import type { Charge, Payment, IncomingTransfer, Refund } from '@shared';
import { billingRows } from './ledger';
import type { BillingData } from './useBilling';

/** Presentation groups use explicit source identities, never coincident dates or amounts. */
export const billKey = (c: Charge) => `${c.patientId}|${c.currency}|${c.billId ? `bill:${c.billId}` : c.encounterId ? `visit:${c.encounterId}` : c.appointmentId ? `appointment:${c.appointmentId}` : `charge:${c.id}`}`;
export const billReference = (key: string) => `B-${key.split('|').slice(-1)[0].replace(/^[^:]+:/, '').slice(-12).toUpperCase()}`;
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
  })).map(b => ({...b, status: b.pending ? 'Awaiting insurance' : b.due ? b.paid>0?'Part paid':'Unpaid' : b.credit?'Credit':'Paid / settled'}))
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
