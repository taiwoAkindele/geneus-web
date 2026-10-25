import { useRef, useState } from 'react';
import { linkedPatientIds, type IncomingTransfer, type Payment } from '@shared';
import { useLiveQuery } from '@/data';
import { listIdentityEvents } from '@/data/repos/patientIdentity';
import { adjustCharge, createCharge, patientBillingFacts, recordPayment } from '@/data/repos/billing';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, Sheet, TextField } from '@/ui';
import { amountInput, formatMoney, parseAmount } from '@/lib/money';
import { billingRequest, matchTransfer, type ReceivingAccount } from '@/lib/api/billing';
import { billingRows, transferAllocated } from './ledger';
import type { BillingData } from './useBilling';

export const PatientAccount = ({ patientId, transfer, data, onClose, onReceipt, onSaved, onSelectAccount }: {
  patientId: string; transfer?: IncomingTransfer; data: BillingData; onClose: () => void;
  onReceipt: (p: Payment) => void; onSaved: () => void;
  onSelectAccount: (patientId: string) => void;
}) => {
  const context = useAuthorizationContext();
  const identities = useLiveQuery(listIdentityEvents);
  const linkedIds = linkedPatientIds(patientId, identities.data ?? []);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [feeId, setFeeId] = useState('');
  const [adjusting, setAdjusting] = useState('');
  const [kind, setKind] = useState<'discount' | 'waiver'>('discount');
  const [reduction, setReduction] = useState('');
  const [percent, setPercent] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState<ReceivingAccount[]>();
  const saving = useRef(false);
  const requestId = useRef(crypto.randomUUID());
  const rows = billingRows(data.charges.filter((c) => c.patientId === patientId), data.payments, data.adjustments);
  const patient = data.patients.find((p) => p.patientId === patientId);
  const perform = async (action: () => Promise<unknown>) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError('');
    try { await action(); onSaved(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.'); }
    finally { saving.current = false; setBusy(false); }
  };
  const savePayment = () => perform(async () => {
    const selected = rows.filter((r) => amounts[r.charge.id]);
    if (!selected.length) throw new Error('Enter an amount against at least one fee');
    const currency = selected[0].charge.currency;
    const allocations = selected.map((r) => {
      if (r.charge.currency !== currency) throw new Error('Collect one currency at a time');
      const amountMinor = parseAmount(amounts[r.charge.id], currency);
      if (amountMinor <= 0 || amountMinor > r.balanceMinor) throw new Error('Amounts must fit the unpaid balances');
      return { chargeId: r.charge.id, amountMinor };
    });
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
    setAdjusting(''); setReason(''); setReduction(''); setAmounts({});
  });
  return <Sheet title={patient?.fullName ?? patientId} eyebrow={transfer ? 'Match bank transfer' : 'Patient billing account'} onClose={onClose} closeDisabled={busy}>
    <p className="mb-3 font-mono text-xs text-ink-muted">{patientId}</p>
    {linkedIds.length > 1 ? <section className="mb-3 space-y-2 rounded-field border border-outline p-3"><h3 className="text-sm font-bold">Accounts under linked patient IDs</h3><p className="text-xs text-ink-muted">Each bill and receipt keeps its original patient ID. Review the other accounts before raising another fee.</p>{linkedIds.filter((id) => id !== patientId).map((id) => <Button key={id} variant="ghost" onClick={() => onSelectAccount(id)}>{data.patients.find((p) => p.id === id)?.fullName ?? id} · {id}</Button>)}</section> : null}
    {transfer ? <p className="mb-3 rounded-card bg-brand-wash p-3 text-sm">Available to match: <strong>{formatMoney(transfer.amountMinor - transferAllocated(transfer.id, data.payments), transfer.currency)}</strong>. Matching needs a connection; bills must have synced.</p> : null}
    <fieldset disabled={busy} className="space-y-3">
      {!transfer && context.permissions.includes('payment:receive') ? <div className="space-y-2"><Button variant="outlined" onClick={() => void perform(async () => setAccounts(await billingRequest<ReceivingAccount[]>('accounts/list', { actorStaffId: context.userId })))}>Show bank details for transfer</Button>{accounts?.filter((a) => !a.departmentId || rows.some((r) => r.charge.departmentId === a.departmentId)).map((a) => <div key={a.id} className="rounded-field bg-brand-wash p-3 text-sm"><strong>{data.departments.find((d) => d.id === a.departmentId)?.name ?? 'Hospital / general'} · {a.mode}</strong><p>{a.bankName} · {a.accountName}</p><p className="font-mono text-lg">{a.accountNumber}</p></div>)}{accounts?.length === 0 ? <p className="text-sm">No receiving accounts are connected. Ask an administrator to configure Departments &amp; accounts.</p> : null}</div> : null}
      {rows.length === 0 ? <p>No fees have been raised for this patient.</p> : rows.map((r) => <article key={r.charge.id} className="rounded-card border border-outline-soft p-3">
        <h3 className="font-bold">{r.charge.description}</h3>
        <p className="text-sm">Original {formatMoney(r.charge.listPriceMinor, r.charge.currency)} · Paid {formatMoney(r.settledMinor, r.charge.currency)}</p>
        {r.charge.exemptionReason ? <p className="text-sm text-brand">Exempt: {r.charge.exemptionReason}</p> : null}
        {r.discountMinor > 0 ? <p className="text-sm">Discount {formatMoney(r.discountMinor, r.charge.currency)}</p> : null}
        {r.waivedMinor > 0 ? <p className="text-sm">Waived {formatMoney(r.waivedMinor, r.charge.currency)}</p> : null}
        <p className="mt-1 font-semibold">Balance {formatMoney(r.balanceMinor, r.charge.currency)}</p>
        {data.adjustments.filter((a) => a.chargeId === r.charge.id).map((a) => <p className="text-xs text-ink-muted" key={a.id}>{a.kind === 'discount' ? 'Discount' : 'Waiver'}: {a.reason} · Approved by {data.staff.find((s) => s.staffId === a.createdBy)?.fullName ?? a.createdBy} · {new Date(a.createdOn).toLocaleString('en-GB')}</p>)}
        {r.balanceMinor > 0 && context.permissions.includes('payment:receive') && (!transfer || (transfer.currency === r.charge.currency && (!transfer.departmentId || transfer.departmentId === r.charge.departmentId))) ? <div className="mt-2 flex items-end gap-2"><TextField label={transfer ? 'Allocate amount' : 'Cash received'} name={`amount-${r.charge.id}`} inputMode="decimal" value={amounts[r.charge.id] ?? ''} onChange={(e) => setAmounts((v) => ({ ...v, [r.charge.id]: e.target.value }))} /><Button fullWidth={false} variant="ghost" onClick={() => setAmounts((v) => ({ ...v, [r.charge.id]: amountInput(r.balanceMinor, r.charge.currency) }))}>Full</Button></div> : null}
        {r.balanceMinor > 0 && context.permissions.includes('payment:waive') ? <Button variant="ghost" onClick={() => { setAdjusting(r.charge.id); setKind('discount'); }}>Discount or waive</Button> : null}
        <div className="mt-2 flex flex-wrap gap-2">{r.receipts.filter((p) => !p.reverses && p.method !== 'waiver').map((p) => <button type="button" key={p.id} className="min-h-[44px] break-all text-left text-xs font-bold text-brand underline" onClick={() => onReceipt(p)}>{p.receiptNumber}</button>)}</div>
      </article>)}
      {adjusting ? <div className="space-y-3 rounded-card bg-surface p-3"><SelectField label="Adjustment" value={kind} options={[{ value: 'discount', label: 'Discount' }, { value: 'waiver', label: 'Waive remaining balance' }]} onChange={(e) => setKind(e.target.value as typeof kind)} />{kind === 'discount' ? <><label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={percent} onChange={(e) => setPercent(e.target.checked)} />Percentage discount</label><TextField label={percent ? 'Percentage' : 'Discount amount'} value={reduction} inputMode="decimal" onChange={(e) => setReduction(e.target.value)} /></> : null}<TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} /><Button onClick={() => void reduce()}>Save adjustment</Button></div> : null}
      {context.permissions.includes('charge:create') && !transfer ? <div className="space-y-2 border-t border-outline-soft pt-3"><SelectField label="Add a fee to this patient" value={feeId} options={[{ value: '', label: 'Choose a fee' }, ...data.fees.filter((f) => f.active).map((f) => ({ value: f.id, label: `${f.name} — ${formatMoney(f.amountMinor, f.currency)}` }))]} onChange={(e) => setFeeId(e.target.value)} /><Button variant="outlined" disabled={!feeId} onClick={() => void addFee()}>Add to bill</Button></div> : null}
    </fieldset>
    {error ? <p role="alert" className="my-3 text-sm text-danger">{error}</p> : null}
    {context.permissions.includes('payment:receive') && rows.some((r) => r.balanceMinor > 0) ? <Button className="mt-4" loading={busy} onClick={() => void savePayment()}>{transfer ? 'Confirm allocation' : 'Record cash & issue receipt'}</Button> : null}
  </Sheet>;
};
