import { useState } from 'react';
import type { Charge, CoverCheck, PatientCover, Refund } from '@shared';
import type { ChargeBalance } from '@/data/repos/billing';
import { coverageDataAge, electSelfPay, selfPayOffered, type CoverageData } from '@/data/repos/insurance';
import { recordRefund, VerificationRequired } from '@/lib/api/insurance';
import { amountInput, formatMoney, parseAmount } from '@/lib/money';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, Sheet, TextAreaField, TextField } from '@/ui';
import { coverageLine } from './coverageLabels';
import { StaffVerification } from './StaffVerification';

/** The insurance lines under one charge on the patient account. Amounts shown are the patient's only. */
export const ChargeCoverage = ({ row, insurance, onSelfPay, onRefund }: {
  row: ChargeBalance; insurance: CoverageData; onSelfPay: (row: ChargeBalance, cover: PatientCover, check?: CoverCheck) => void; onRefund: (row: ChargeBalance) => void;
}) => {
  const context = useAuthorizationContext();
  const estimate = row.coverage;
  const line = coverageLine(estimate);
  const money = (n: number) => formatMoney(n, row.charge.currency);
  const refunds = insurance.refunds.filter((r) => r.allocations.some((a) => a.chargeId === row.charge.id));
  const cover = estimate && 'cover' in estimate ? estimate.cover : undefined;
  const notEligible = estimate?.state === 'undetermined' && estimate.reason === 'not_eligible' ? estimate.check : undefined;
  const offerSelfPay = Boolean(cover && (estimate?.state === 'undetermined' || estimate?.state === 'estimated') && context.permissions.includes('coverage:elect_self_pay')
    && selfPayOffered(row.charge, cover!, insurance, notEligible));
  const age = coverageDataAge(insurance);
  return <>
    {line ? <div className={`mt-2 rounded-field p-2 text-sm ${line.tone === 'warn' ? 'bg-amber-bg' : 'bg-surface'}`}>
      <p className="font-semibold">{line.label}</p>
      {estimate?.state === 'estimated' ? <p>Patient pays {money(estimate.patientShareMinor)} · estimate{age ? ` from cover data synced ${new Date(age).toLocaleString('en-GB')}` : ''}. The rest is handled under the insurance agreement.</p> : null}
      {estimate?.state === 'finalised' ? <p>Patient pays {money(estimate.allocation.patientShareMinor)}. The rest is handled under the insurance agreement.</p> : null}
      {row.undeterminedMinor > 0 ? <p>{money(row.undeterminedMinor)} awaiting an insurance decision — not part of the amount due.</p> : null}
      {line.next ? <p className="text-xs text-ink-muted">{line.next}</p> : null}
      {offerSelfPay ? <Button variant="ghost" fullWidth={false} onClick={() => onSelfPay(row, cover!, notEligible)}>Patient chooses to pay without insurance</Button> : null}
    </div> : null}
    {refunds.map((r) => <p key={r.id} className="text-xs text-ink-muted">Refunded {money(r.allocations.find((a) => a.chargeId === row.charge.id)!.amountMinor)} · {r.refundNumber} · {r.reason} · {new Date(r.createdOn).toLocaleString('en-GB')}</p>)}
    {row.balanceMinor < 0 ? row.final
      ? (context.permissions.includes('payment:refund') ? <Button variant="ghost" fullWidth={false} onClick={() => onRefund(row)}>Refund credit</Button> : <p className="text-xs text-ink-muted">A supervisor can refund this credit.</p>)
      : <p className="text-xs text-ink-muted">This credit can be refunded once insurance for the charge is confirmed.</p> : null}
  </>;
};

/** Recorded on this device and checked again by the server against the contract in force that day. */
export const SelfPaySheet = ({ row, cover, check, onClose, onSaved }: { row: ChargeBalance; cover: PatientCover; check?: CoverCheck; onClose: () => void; onSaved: () => void }) => {
  const context = useAuthorizationContext();
  const [agreed, setAgreed] = useState(false); const [note, setNote] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError('');
    try {
      if (!agreed) throw new Error('Confirm that the patient agreed to pay without insurance');
      await electSelfPay({ patientId: row.charge.patientId, coverId: cover.id, chargeIds: [row.charge.id], reason: check ? 'not_eligible' : 'patient_choice', coverCheckId: check?.id, note }, context);
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not record the choice'); } finally { setBusy(false); }
  };
  return <Sheet title="Pay without insurance" eyebrow={row.charge.description} onClose={onClose} closeDisabled={busy}>
    <div className="space-y-3">
      <p className="text-sm">{check ? 'The cover check found the patient not eligible on this date.' : 'The contract in force on this date allows members to choose to pay themselves.'} The patient will owe the full {formatMoney(row.charge.amountMinor, row.charge.currency)} for this charge.</p>
      <p className="text-xs text-ink-muted">The choice is kept in the record. If cover is later confirmed for this date, the insurance officer reviews it.</p>
      <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />The patient agreed to pay without insurance</label>
      <TextAreaField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button loading={busy} disabled={busy} onClick={() => void save()}>Record choice</Button>
    </div>
  </Sheet>;
};

/**
 * Money handed back from a final credit. Online only and verified: the server
 * locks the charge and refuses anything above the credit or the cash received.
 * The payment that created the credit stays exactly as recorded.
 */
export const RefundSheet = ({ row, onClose, onDone }: { row: ChargeBalance; onClose: () => void; onDone: (refund: Refund) => void }) => {
  const context = useAuthorizationContext();
  const credit = -row.balanceMinor;
  const [amount, setAmount] = useState(amountInput(credit, row.charge.currency)); const [method, setMethod] = useState<Refund['method']>('cash');
  const [reason, setReason] = useState(''); const [reference, setReference] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [id] = useState(() => `refund:${crypto.randomUUID()}`);
  const save = async () => {
    setBusy(true); setError('');
    try {
      const amountMinor = parseAmount(amount, row.charge.currency);
      if (amountMinor <= 0 || amountMinor > credit) throw new Error(`Refund up to ${formatMoney(credit, row.charge.currency)}`);
      if (!reason.trim()) throw new Error('Give the reason for the refund');
      onDone(await recordRefund(context, { id, patientId: row.charge.patientId, method, currency: row.charge.currency, allocations: [{ chargeId: row.charge.id, amountMinor }], reason: reason.trim(), reference: reference.trim() || undefined }));
    } catch (cause) { setError(cause instanceof VerificationRequired ? 'Your verification ended. Verify again, then refund.' : cause instanceof Error ? cause.message : 'The refund was not recorded'); } finally { setBusy(false); }
  };
  return <Sheet title="Refund credit" eyebrow={(row.charge as Charge).description} onClose={onClose} closeDisabled={busy}>
    <StaffVerification purpose="Refunding a credit">
      <div className="space-y-3">
        <p className="text-sm">Credit on this charge: <strong>{formatMoney(credit, row.charge.currency)}</strong>. Hand the money back before saving.</p>
        <TextField label="Amount refunded" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <SelectField label="Refunded by" value={method} options={[{ value: 'cash', label: 'Cash' }, { value: 'transfer', label: 'Bank transfer' }, { value: 'pos', label: 'POS reversal' }]} onChange={(e) => setMethod(e.target.value as Refund['method'])} />
        <TextField label="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
        <TextAreaField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <Button loading={busy} disabled={busy} onClick={() => void save()}>Record refund</Button>
      </div>
    </StaffVerification>
  </Sheet>;
};
