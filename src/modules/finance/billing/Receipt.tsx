import { useState } from 'react';
import type { Payment } from '@shared';
import { Button, Sheet } from '@/ui';
import { formatMoney } from '@/lib/money';
import { useSession } from '@/session';
import type { BillingData } from './useBilling';

export const Receipt = ({ payment, data, onClose }: { payment: Payment; data: BillingData; onClose: () => void }) => {
  const { facility } = useSession();
  const patient = data.patients.find((p) => p.patientId === payment.patientId);
  const staff = data.staff.find((s) => s.staffId === payment.createdBy);
  const [printError, setPrintError] = useState('');
  const print = () => {
    const popup = window.open('', '_blank', 'width=500,height=650');
    if (!popup) { setPrintError('The print window was blocked. Allow pop-ups for this app and try again. The payment is already recorded; do not record it again.'); return; }
    setPrintError('');
    const root = document.createElement('main');
    const lines = [facility.name, 'Payment receipt', payment.receiptNumber, patient?.fullName ?? payment.patientId, payment.patientId,
      new Date(payment.createdOn).toLocaleString('en-GB'), `Method: ${payment.method}`,
      ...payment.allocations.map((a) => `${data.charges.find((c) => c.id === a.chargeId)?.description ?? 'Fee'}: ${formatMoney(a.amountMinor, payment.currency)}`),
      `Total: ${formatMoney(payment.amountMinor, payment.currency)}`, `Received by: ${staff?.fullName ?? payment.createdBy}`, payment.reference ?? ''];
    for (const line of lines) { const p = document.createElement('p'); p.textContent = line; root.append(p); }
    popup.document.title = payment.receiptNumber; popup.document.body.append(root); popup.focus(); popup.print();
  };
  return <Sheet title="Payment receipt" eyebrow={facility.name} onClose={onClose}>
    <p className="font-mono text-sm">{payment.receiptNumber}</p>
    <h2 className="mt-3 text-xl font-bold">{patient?.fullName ?? payment.patientId}</h2>
    <p className="text-sm text-ink-muted">{payment.patientId} · {new Date(payment.createdOn).toLocaleString('en-GB')}</p>
    <div className="my-4 divide-y divide-outline-soft">{payment.allocations.map((a) => <div key={a.chargeId} className="flex justify-between gap-3 py-3"><span>{data.charges.find((c) => c.id === a.chargeId)?.description ?? 'Fee'}</span><strong>{formatMoney(a.amountMinor, payment.currency)}</strong></div>)}</div>
    <p className="text-lg font-bold">Total {formatMoney(payment.amountMinor, payment.currency)}</p>
    <p className="my-3 text-sm">{payment.method === 'cash' ? 'Cash' : 'Bank transfer'} · {staff?.fullName ?? payment.createdBy}</p>
    {payment.reference ? <p className="mb-4 break-all text-sm">Reference: {payment.reference}</p> : null}
    <Button onClick={print}>Print receipt</Button>
    {printError ? <p role="alert" className="mt-3 text-sm text-danger">{printError}</p> : null}
  </Sheet>;
};
