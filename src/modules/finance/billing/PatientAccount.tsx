import { useEffect, useRef, useState } from 'react';
import { linkedPatientIds, type IncomingTransfer, type Payment } from '@shared';
import { useLiveQuery } from '@/data';
import { listIdentityEvents } from '@/data/repos/patientIdentity';
import { adjustCharge, createCharge, patientBillingFacts, recordPayment } from '@/data/repos/billing';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, Sheet, TextField, useToast } from '@/ui';
import { amountInput, formatMoney, parseAmount } from '@/lib/money';
import { billingRequest, matchTransfer, type ReceivingAccount } from '@/lib/api/billing';
import { billingRows, transferAllocated } from './ledger';
import type { BillingData } from './useBilling';
import { PaymentInputError, preparePayment } from './paymentDraft';
import type { CoverCheck, PatientCover } from '@shared';
import type { ChargeBalance } from '@/data/repos/billing';
import { ChargeCoverage, RefundSheet, SelfPaySheet } from '@/modules/insurance/AccountCoverage';


export const PatientAccount = ({ patientId, transfer, data, onClose, onReceipt, onSaved, onSelectAccount }: {
  patientId: string; transfer?: IncomingTransfer; data: BillingData; onClose: () => void;
  onReceipt: (p: Payment) => void; onSaved: () => void;
  onSelectAccount: (patientId: string) => void;
}) => {
  const context = useAuthorizationContext();
  const identities = useLiveQuery(listIdentityEvents);
  const linkedIds = linkedPatientIds(patientId, identities.data ?? []);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [received, setReceived] = useState('');
  const [feeId, setFeeId] = useState('');
  const [adjusting, setAdjusting] = useState('');
  const [kind, setKind] = useState<'discount' | 'waiver'>('discount');
  const [reduction, setReduction] = useState('');
  const [percent, setPercent] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [review, setReview] = useState<ReturnType<typeof preparePayment>>();
  const [leaving, setLeaving] = useState<() => void>();
  const [accounts, setAccounts] = useState<ReceivingAccount[]>();
  const [selfPay, setSelfPay] = useState<{ row: ChargeBalance; cover: PatientCover; check?: CoverCheck }>();
  const [refunding, setRefunding] = useState<ChargeBalance>();
  const toast = useToast();
  const errorSummary = useRef<HTMLDivElement>(null);
  const reviewSection = useRef<HTMLElement>(null);
  useEffect(() => { if (error) errorSummary.current?.focus(); }, [error]);
  useEffect(() => { if (review) reviewSection.current?.focus(); }, [review]);
  const saving = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  const rows = billingRows(data.charges.filter((c) => c.patientId === patientId), data.payments, data.adjustments, data.coverage);
  const patient = data.patients.find((p) => p.patientId === patientId);
  const dirty = Object.values(amounts).some((value) => Boolean(value.trim())) || Boolean(received.trim() || feeId || adjusting || reduction || reason);
  const requestLeave = (action: () => void) => { if (dirty) setLeaving(() => action); else action(); };
  const available = transfer ? transfer.amountMinor - transferAllocated(transfer.id, data.payments) : undefined;
  const checkPayment = () => preparePayment(rows, amounts, transfer, available);
  // One amount for the whole account, applied to the oldest payable charges first.
  // The split fills the per-charge boxes, which stay editable before the review.
  const payable = rows.filter((r) => r.balanceMinor > 0 && context.permissions.includes('payment:receive') && (!transfer || (transfer.currency === r.charge.currency && (!transfer.departmentId || transfer.departmentId === r.charge.departmentId))))
    .sort((a, b) => a.charge.createdOn.localeCompare(b.charge.createdOn) || a.charge.id.localeCompare(b.charge.id));
  const currency = new Set(payable.map((r) => r.charge.currency)).size === 1 ? payable[0].charge.currency : undefined;
  const due = payable.reduce((total, r) => total + r.balanceMinor, 0);
  const splitReceived = (value: string) => {
    setReceived(value); setError(''); setFieldError(undefined);
    if (!currency) return;
    let left: number;
    try { left = value.trim() ? parseAmount(value, currency) : 0; } catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the amount.'); return; }
    const next: Record<string, string> = {};
    for (const r of payable) { if (left <= 0) break; const part = Math.min(left, r.balanceMinor); next[r.charge.id] = amountInput(part, currency); left -= part; }
    setAmounts(next);
    if (left > 0) setError(`That is ${formatMoney(left, currency)} more than the amount due. Record only what is due; return the difference to the patient.`);
  };
  const reviewPayment = () => {
    setError(''); setFieldError(undefined);
    try { setReview(checkPayment()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Check the payment amounts.'); if (cause instanceof PaymentInputError) setFieldError(cause.chargeId); }
  };
  const perform = async (action: () => Promise<unknown>) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try { await action(); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.'); }
    finally { saving.current = false; setBusy(false); }
  };
  const savePayment = () => perform(async () => {
    const checked = checkPayment();
    if (!review || JSON.stringify(review) !== JSON.stringify(checked)) { setReview(undefined); throw new Error('The payment changed. Check the amounts and review it again.'); }
    const { currency, allocations } = checked;
    const payment = transfer
      ? await matchTransfer(transfer.id, patientId, allocations, context.userId, requestId.current)
      : await recordPayment({ patientId, method: 'cash', currency, allocations }, context);
    onReceipt(payment);
  });
  const addFee = () => perform(async () => {
    if (!patient || !feeId) throw new Error('Select a fee');
    await createCharge(feeId, { patientId, facts: patientBillingFacts(patient) }, context);
    setFeeId('');
  });
  const reduce = () => perform(async () => {
    const row = rows.find((r) => r.charge.id === adjusting);
    if (!row) throw new Error('Select a bill');
    let amount = kind === 'waiver' ? row.balanceMinor : parseAmount(reduction, row.charge.currency);
    if (kind === 'discount' && percent) {
      const value = Number(reduction);
      if (!Number.isFinite(value) || value <= 0 || value > 100) throw new Error('Enter a percentage from 0 to 100');
      amount = Math.round(row.balanceMinor * value / 100);
    }
    await adjustCharge(adjusting, kind, amount, reason, context);
    setAdjusting(''); setReason(''); setReduction(''); setAmounts({}); setReceived('');
  });
  return <Sheet title={review ? 'Review payment' : patient?.fullName ?? patientId} eyebrow={transfer ? 'Match bank transfer' : 'Patient billing account'} onClose={onClose} closeDisabled={busy} hasUnsavedChanges={dirty}>
    <p className="mb-3 font-mono text-xs text-ink-muted">{patientId}</p>
    {leaving ? <div role="alert" className="mb-4 rounded-field border border-amber-border bg-amber-bg p-4 text-sm"><p className="font-bold">Discard this unfinished payment?</p><p className="mt-1">No payment has been recorded. The amounts you entered will be cleared.</p><div className="mt-3 flex flex-wrap gap-2"><Button fullWidth={false} onClick={() => setLeaving(undefined)}>Keep editing</Button><Button fullWidth={false} variant="outlined" onClick={() => { setLeaving(undefined); leaving(); }}>Discard and continue</Button></div></div> : null}
    {review ? <section ref={reviewSection} tabIndex={-1} className="space-y-4 outline-none" aria-label="Payment review"><h3 className="font-bold">{patient?.fullName ?? patientId}</h3><p className="text-sm">{transfer ? 'Bank transfer allocation · requires a connection' : 'Cash received · saved on this device first'}</p><dl className="divide-y divide-outline-soft">{review.allocations.map((allocation) => <div key={allocation.chargeId} className="flex justify-between gap-3 py-3"><dt>{rows.find((row) => row.charge.id === allocation.chargeId)?.charge.description}</dt><dd className="font-mono font-bold">{formatMoney(allocation.amountMinor, review.currency)}</dd></div>)}</dl><p className="text-xl font-extrabold">Total {formatMoney(review.amountMinor, review.currency)}</p><p className="text-sm text-ink-muted">Confirm that the patient, amount and method are correct. A receipt will be issued after the payment is recorded.</p></section> : null}
    {linkedIds.length > 1 ? <section className="mb-3 space-y-2 rounded-field border border-outline p-3"><h3 className="text-sm font-bold">Accounts under linked patient IDs</h3><p className="text-xs text-ink-muted">Each bill and receipt keeps its original patient ID. Review the other accounts before raising another fee.</p>{linkedIds.filter((id) => id !== patientId).map((id) => <Button key={id} variant="ghost" onClick={() => requestLeave(() => onSelectAccount(id))}>{data.patients.find((p) => p.id === id)?.fullName ?? id} · {id}</Button>)}</section> : null}
    {transfer ? <p className="mb-3 rounded-card bg-brand-wash p-3 text-sm">Available to match: <strong>{formatMoney(transfer.amountMinor - transferAllocated(transfer.id, data.payments), transfer.currency)}</strong>. Matching needs a connection; bills must have synced.</p> : null}
    <fieldset disabled={busy} className={review ? 'hidden' : 'space-y-3'}>
      {!transfer && context.permissions.includes('payment:receive') ? <div className="space-y-2"><Button variant="outlined" onClick={() => void perform(async () => setAccounts(await billingRequest<ReceivingAccount[]>('accounts/list', { actorStaffId: context.userId })))}>Show bank details for transfer</Button>{accounts?.filter((a) => !a.departmentId || rows.some((r) => r.charge.departmentId === a.departmentId)).map((a) => <div key={a.id} className="rounded-field bg-brand-wash p-3 text-sm"><strong>{data.departments.find((d) => d.id === a.departmentId)?.name ?? 'Hospital / general'} · {a.mode}</strong><p>{a.bankName} · {a.accountName}</p><p className="font-mono text-lg">{a.accountNumber}</p></div>)}{accounts?.length === 0 ? <p className="text-sm">No receiving accounts are connected. Ask an administrator to configure Departments &amp; accounts.</p> : null}</div> : null}
      {currency && payable.length ? <section aria-label="Amount due" className="rounded-card border-2 border-brand-tint bg-brand-wash p-4">
        <p className="text-sm font-semibold text-ink-soft">Amount due</p><p className="font-mono text-2xl font-extrabold">{formatMoney(due, currency)}</p>
        <div className="mt-3 flex items-end gap-2"><TextField label={transfer ? 'Amount to allocate' : 'Amount received'} name="amount-received" inputMode="decimal" value={received} onChange={(e) => splitReceived(e.target.value)} /><Button fullWidth={false} variant="ghost" onClick={() => splitReceived(amountInput(due, currency))}>Full amount</Button></div>
        <p className="mt-2 text-xs text-ink-muted">Applied to the oldest charges first. Change any charge below before reviewing.</p>
      </section> : null}
      {rows.some((r) => r.undeterminedMinor > 0) ? <section aria-label="Awaiting insurance" className="rounded-card border border-amber-border bg-amber-bg p-4 text-sm"><p className="font-semibold">Awaiting an insurance decision</p>{[...new Set(rows.map((r) => r.charge.currency))].map((c) => { const total = rows.filter((r) => r.charge.currency === c).reduce((n, r) => n + r.undeterminedMinor, 0); return total ? <p key={c} className="font-mono text-lg font-bold">{formatMoney(total, c)}</p> : null; })}<p className="mt-1">Not part of the amount due. The patient is not asked to pay it until insurance is decided; care continues.</p></section> : null}
      {rows.length === 0 ? <p>No fees have been raised for this patient.</p> : rows.map((r) => <article key={r.charge.id} className="rounded-card border border-outline-soft p-3">
        <h3 className="font-bold">{r.charge.description}</h3>
        <p className="text-sm">Original {formatMoney(r.charge.listPriceMinor, r.charge.currency)} · Paid {formatMoney(r.settledMinor, r.charge.currency)}</p>
        {r.charge.exemptionReason ? <p className="text-sm text-brand">Exempt: {r.charge.exemptionReason}</p> : null}
        {r.discountMinor > 0 ? <p className="text-sm">{data.adjustments.some((a) => a.chargeId === r.charge.id && a.dispenseEntryId) ? 'Discounts / medicine returns' : 'Discount'} {formatMoney(r.discountMinor, r.charge.currency)}</p> : null}
        {r.waivedMinor > 0 ? <p className="text-sm">Waived {formatMoney(r.waivedMinor, r.charge.currency)}</p> : null}
        <p className="mt-1 font-semibold">{r.balanceMinor < 0 ? `Patient credit ${formatMoney(-r.balanceMinor, r.charge.currency)}` : `Balance ${formatMoney(r.balanceMinor, r.charge.currency)}`}</p>
        <ChargeCoverage row={r} insurance={data.insurance} onSelfPay={(row, cover, check) => setSelfPay({ row, cover, check })} onRefund={setRefunding} />
        {data.adjustments.filter((a) => a.chargeId === r.charge.id).map((a) => <p className="text-xs text-ink-muted" key={a.id}>{a.dispenseEntryId ? 'Medicine return credit' : a.kind === 'discount' ? 'Discount' : 'Waiver'}: {a.reason} · Approved by {data.staff.find((s) => s.staffId === a.createdBy)?.fullName ?? a.createdBy} · {new Date(a.createdOn).toLocaleString('en-GB')}</p>)}
        {r.balanceMinor > 0 && context.permissions.includes('payment:receive') && (!transfer || (transfer.currency === r.charge.currency && (!transfer.departmentId || transfer.departmentId === r.charge.departmentId))) ? <div className="mt-2 flex items-end gap-2"><TextField label={transfer ? 'Allocate amount' : 'Cash received'} name={`amount-${r.charge.id}`} error={fieldError === r.charge.id ? error : undefined} inputMode="decimal" value={amounts[r.charge.id] ?? ''} onChange={(e) => { setAmounts((v) => ({ ...v, [r.charge.id]: e.target.value })); setFieldError(undefined); setError(''); }} /><Button fullWidth={false} variant="ghost" onClick={() => setAmounts((v) => ({ ...v, [r.charge.id]: amountInput(r.balanceMinor, r.charge.currency) }))}>Full</Button></div> : null}
        {r.balanceMinor > 0 && context.permissions.includes('payment:waive') ? <Button variant="ghost" onClick={() => { setAdjusting(r.charge.id); setKind('discount'); }}>Discount or waive</Button> : null}
        <div className="mt-2 flex flex-wrap gap-2">{r.receipts.filter((p) => !p.reverses && p.method !== 'waiver').map((p) => <button type="button" key={p.id} className="min-h-[44px] break-all text-left text-xs font-bold text-brand underline" onClick={() => requestLeave(() => onReceipt(p))}>{p.receiptNumber}</button>)}</div>
      </article>)}
      {adjusting ? <div className="space-y-3 rounded-card bg-surface p-3"><SelectField label="Adjustment" value={kind} options={[{ value: 'discount', label: 'Discount' }, { value: 'waiver', label: 'Waive remaining balance' }]} onChange={(e) => setKind(e.target.value as typeof kind)} />{kind === 'discount' ? <><label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={percent} onChange={(e) => setPercent(e.target.checked)} />Percentage discount</label><TextField label={percent ? 'Percentage' : 'Discount amount'} value={reduction} inputMode="decimal" onChange={(e) => setReduction(e.target.value)} /></> : null}<TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} /><Button onClick={() => void reduce()}>Save adjustment</Button></div> : null}
      {context.permissions.includes('charge:create') && !transfer ? <div className="space-y-2 border-t border-outline-soft pt-3"><SelectField label="Add a fee to this patient" value={feeId} options={[{ value: '', label: 'Choose a fee' }, ...data.fees.filter((f) => f.active).map((f) => ({ value: f.id, label: `${f.name} — ${formatMoney(f.amountMinor, f.currency)}` }))]} onChange={(e) => setFeeId(e.target.value)} /><Button variant="outlined" disabled={!feeId} onClick={() => void addFee()}>Add to bill</Button></div> : null}
    </fieldset>
    {error ? <div ref={errorSummary} tabIndex={-1} role="alert" className="my-3 rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger"><p>{error}</p>{fieldError ? <button type="button" className="mt-1 min-h-[44px] font-bold underline" onClick={() => document.getElementById('amount-' + fieldError)?.focus()}>Go to amount</button> : null}</div> : null}
    {selfPay ? <SelfPaySheet row={selfPay.row} cover={selfPay.cover} check={selfPay.check} onClose={() => setSelfPay(undefined)} onSaved={() => { setSelfPay(undefined); toast('Choice recorded. The patient now owes the full price for this charge.'); onSaved(); }} /> : null}
    {refunding ? <RefundSheet row={refunding} onClose={() => setRefunding(undefined)} onDone={(refund) => { setRefunding(undefined); toast(`Refund ${refund.refundNumber} recorded`); onSaved(); }} /> : null}
    {context.permissions.includes('payment:receive') && rows.some((r) => r.balanceMinor > 0) ? review ? <div className="mt-4 flex flex-wrap gap-2"><Button variant="outlined" fullWidth={false} disabled={busy} onClick={() => { setReview(undefined); setError(''); }}>Edit payment</Button><Button fullWidth={false} className="flex-1" loading={busy} onClick={() => void savePayment()}>{transfer ? 'Confirm allocation' : 'Confirm & record cash'}</Button></div> : <Button className="mt-4" onClick={reviewPayment}>Review payment</Button> : null}
  </Sheet>;
};
