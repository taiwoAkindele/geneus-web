import { useState } from 'react';
import type { Payment } from '@shared';
import { Button, Sheet } from '@/ui';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/session';
import type { BillingData } from './useBilling';
import { displayMoney } from './billingUi';

/**
 * A receipt. Right after a payment is recorded (`fresh`) it also says what happened and offers the next step;
 * reopened later it is just the receipt. Printing never records the payment again.
 */
export const Receipt = ({ payment, data, onClose, fresh = false, onNextPatient }: { payment: Payment; data: BillingData; onClose: () => void; fresh?: boolean; onNextPatient?: () => void }) => {
  const { facility } = useSession();
  const patient = data.patients.find((p) => p.patientId === payment.patientId);
  const staff = data.staff.find((s) => s.staffId === payment.createdBy);
  const [printError, setPrintError] = useState('');
  const money = (n: number) => displayMoney(n, payment.currency);
  const method = payment.method === 'cash' ? 'Cash' : payment.method === 'transfer' ? 'Bank transfer' : payment.method;
  const print = () => {
    const popup = window.open('', '_blank', 'width=500,height=650');
    if (!popup) { setPrintError('The print window was blocked. Allow pop-ups for this app and try again. The payment is already recorded; do not record it again.'); return; }
    setPrintError('');
    const root = document.createElement('main');
    const lines = [facility.name, payment.reverses ? 'Payment reversal · not a new collection' : 'Payment receipt', payment.receiptNumber, patient?.fullName ?? payment.patientId, payment.patientId,
      new Date(payment.createdOn).toLocaleString('en-GB'), `Method: ${method}`,
      ...payment.allocations.map((a) => `${data.charges.find((c) => c.id === a.chargeId)?.description ?? 'Fee'}: ${formatMoney(a.amountMinor, payment.currency)}`),
      `Total: ${formatMoney(payment.amountMinor, payment.currency)}`, `Received by: ${staff?.fullName ?? payment.createdBy}`, payment.reference ?? ''];
    for (const line of lines) { const p = document.createElement('p'); p.textContent = line; root.append(p); }
    popup.document.title = payment.receiptNumber; popup.document.body.append(root); popup.focus(); popup.print();
  };
  return <Sheet placement={fresh ? 'side' : 'center'} title={fresh ? `${money(payment.amountMinor)} received` : payment.reverses ? 'Payment reversal' : 'Receipt'} eyebrow={fresh ? `${method} · ${patient?.fullName ?? payment.patientId}` : facility.name} onClose={onClose}>
    <div className="space-y-4">
      {fresh ? <p role="status" className="rounded-field bg-slate-bg p-3 text-sm text-slate-text">{payment.incomingTransferId ? 'Recorded by the server. The bill is updated.' : 'Saved on this device. Other staff see it once this device syncs.'}</p> : null}
      {payment.reverses ? <p className="font-bold text-danger">Reversal of payment {payment.reverses}. This is not a new collection.</p> : null}
      <div className="rounded-card border border-outline-soft bg-white p-4">
        <div className="flex justify-between gap-3 text-sm"><span className="font-mono text-xs">{payment.receiptNumber}</span><span className="text-ink-muted">{new Date(payment.createdOn).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></div>
        {fresh ? null : <><h2 className="mt-3 text-xl font-bold">{patient?.fullName ?? payment.patientId}</h2><p className="text-sm text-ink-muted">{payment.patientId}</p></>}
        <div className="my-3 divide-y divide-outline-soft">{payment.allocations.map((a) => <div key={a.chargeId} className="flex justify-between gap-3 py-2.5 text-sm"><span>{data.charges.find((c) => c.id === a.chargeId)?.description ?? 'Fee'}</span><span className="font-semibold tabular-nums">{money(a.amountMinor)}</span></div>)}</div>
        <div className="flex justify-between font-bold"><span>Total</span><span className="tabular-nums">{money(payment.amountMinor)}</span></div>
        <p className="mt-2 text-sm text-ink-muted">{method} · received by {staff?.fullName ?? payment.createdBy}</p>
        {payment.reference ? <p className="break-all text-sm text-ink-muted">Reference: {payment.reference}</p> : null}
      </div>
      <Button onClick={print}>{printError ? 'Print again' : 'Print receipt'}</Button>
      {printError ? <p role="alert" className="text-sm text-danger">{printError}</p> : null}
      {fresh ? <div className="grid grid-cols-2 gap-2">{onNextPatient ? <Button variant="outlined" onClick={onNextPatient}>Next patient</Button> : null}<Button variant="outlined" onClick={onClose}>Back to bill</Button></div> : null}
    </div>
  </Sheet>;
};
