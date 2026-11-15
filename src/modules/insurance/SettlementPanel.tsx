import { useCallback, useEffect, useState } from 'react';
import { PayerDecisionKind, type ClaimView } from '@shared';
import { listDisputes, openDispute, recordPayerDecision, resolveDispute, SETTLEMENT_LABELS, VerificationRequired, writeOff, type DisputeView } from '@/lib/api/insurance';
import { formatMoney, parseAmount } from '@/lib/money';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, TextField, useToast } from '@/ui';

const describeError = (cause: unknown) => cause instanceof VerificationRequired ? 'Your session with the server ended. Confirm your PIN to continue.' : cause instanceof Error ? cause.message : 'The request failed';
export const DECISION_LABELS: Record<PayerDecisionKind, string> = { approved: 'Approved in full', partially_approved: 'Partly approved', queried: 'Queried', returned: 'Returned for correction', denied: 'Denied' };
const today = () => new Date().toISOString().slice(0, 10);
/** An amount typed by a person, in minor units; undefined when it is not a valid amount. */
const toMinor = (value: string, currency = 'NGN'): number | undefined => { if (!value.trim()) return undefined; try { const n = parseAmount(value, currency); return n >= 0 ? n : undefined; } catch { return undefined; } };
const typed = (value: string) => value.replace(/[^\d.]/g, '');

/**
 * What the payer decided and paid on one claim, as the hospital recorded it.
 * Expected, approved, paid, disputed and written-off amounts stay apart;
 * nothing here ever changes what the patient owes.
 */
export const SettlementPanel = ({ claim, onChanged, onError }: { claim: ClaimView; onChanged: () => void; onError: (m: string) => void }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const s = claim.settlement;
  const [disputes, setDisputes] = useState<DisputeView[]>([]);
  const loadDisputes = useCallback(async () => { try { setDisputes((await listDisputes(context)).disputes.filter((d) => d.claimNumber === claim.claimNumber)); } catch (cause) { onError(describeError(cause)); } }, [context, claim.claimNumber, onError]);
  useEffect(() => { void loadDisputes(); }, [loadDisputes]);
  if (!s) return null;
  const money = (n: number) => formatMoney(n, claim.currency);
  const live = !claim.supersededBy && (claim.state === 'submitted' || claim.state === 'acknowledged');
  const done = (message: string) => { toast(message); void loadDisputes(); onChanged(); };
  return <section aria-label="Payer response and payment" className="space-y-3 rounded-field border border-outline-soft p-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-bold">Payer response and payment</h3><span data-settlement={s.status} className="text-sm font-semibold">{SETTLEMENT_LABELS[s.status]}{s.overdue ? ' · overdue' : ''}</span></div>
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
      <dt className="text-ink-soft">Claimed</dt><dd>{money(s.expectedMinor)}</dd>
      <dt className="text-ink-soft">Approved</dt><dd>{s.approvedMinor === undefined ? 'Not decided' : money(s.approvedMinor)}</dd>
      <dt className="text-ink-soft">Deducted</dt><dd>{money(s.deductedMinor)}</dd>
      <dt className="text-ink-soft">Received</dt><dd>{money(s.paidMinor)}</dd>
      <dt className="text-ink-soft">Disputed</dt><dd>{money(s.disputedMinor)}</dd>
      <dt className="text-ink-soft">Written off</dt><dd>{money(s.writtenOffMinor)}</dd>
      <dt className="text-ink-soft">Outstanding</dt><dd className="font-semibold">{money(s.outstandingMinor)}</dd>
      <dt className="text-ink-soft">Payer still owes</dt><dd>{money(s.payerOwesMinor)}</dd>
    </dl>
    <p className="text-xs text-ink-soft">Unpaid or rejected amounts stay with the payer or are written off by the hospital. They never become the patient's debt.</p>
    {claim.decisions?.length ? <ul aria-label="Payer decisions" className="space-y-1 text-sm">{claim.decisions.map((d) => <li key={d.id}>{d.decidedOn} · {DECISION_LABELS[d.decision]} · {money(d.approvedMinor)}{d.reasonCode ? ` · ${d.reasonCode}` : ''}{d.reason ? ` · ${d.reason}` : ''}{d.payerReference ? ` · ref ${d.payerReference}` : ''}</li>)}</ul> : null}
    {live && context.permissions.includes('coverage:confirm') ? <DecisionForm claim={claim} onSaved={() => done('Payer decision recorded.')} onError={onError} /> : null}
    {disputes.length ? <ul aria-label="Disputes" className="space-y-2 text-sm">{disputes.map((d) => <li key={d.id} className="rounded-field bg-surface-muted p-2">
      Dispute of {money(d.amountMinor)} · {d.reason}{d.payerReference ? ` · ref ${d.payerReference}` : ''} · opened {d.openedOn.slice(0, 10)}
      {d.resolution ? <span className="block">Resolved: {d.resolution.outcome.replace(/_/g, ' ')} · {d.resolution.note}</span>
        : context.permissions.includes('coverage:confirm') ? <ResolveDispute dispute={d} onSaved={() => done('Dispute resolved.')} onError={onError} /> : null}
    </li>)}</ul> : null}
    {!claim.supersededBy && s.status !== 'not_submitted' && s.status !== 'settled' ? <div className="grid gap-3 lg:grid-cols-2">
      {context.permissions.includes('coverage:confirm') ? <AmountForm label="Dispute an amount with the payer" action="Open dispute" max={s.outstandingMinor - s.disputedMinor} currency={claim.currency} withReference
        onSubmit={(amountMinor, reason, payerReference) => openDispute(context, { claimId: claim.id, amountMinor, reason, ...(payerReference ? { payerReference } : {}) }).then(() => done('Dispute opened.'), (cause) => onError(describeError(cause)))} /> : null}
      {context.permissions.includes('billing:write_off') ? <AmountForm label="Write off what the payer will not pay" action="Write off" max={s.outstandingMinor - s.disputedMinor} currency={claim.currency}
        onSubmit={(amountMinor, reason) => writeOff(context, { claimId: claim.id, amountMinor, reason }).then(() => done('Written off. The patient owes nothing more because of it.'), (cause) => onError(describeError(cause)))} /> : null}
    </div> : null}
  </section>;
};

const DecisionForm = ({ claim, onSaved, onError }: { claim: ClaimView; onSaved: () => void; onError: (m: string) => void }) => {
  const context = useAuthorizationContext();
  const [open, setOpen] = useState(false); const [decision, setDecision] = useState<PayerDecisionKind>('approved'); const [decidedOn, setDecidedOn] = useState(today());
  const [reasonCode, setReasonCode] = useState(''); const [reason, setReason] = useState(''); const [payerReference, setPayerReference] = useState('');
  const [perLine, setPerLine] = useState(false); const [total, setTotal] = useState(''); const [lines, setLines] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false);
  if (!open) return <Button variant="outlined" fullWidth={false} onClick={() => setOpen(true)}>Record the payer's decision</Button>;
  const save = async () => {
    setBusy(true);
    try {
      const partial = decision === 'partially_approved';
      await recordPayerDecision(context, {
        claimId: claim.id, decision, decidedOn, ...(reasonCode.trim() ? { reasonCode: reasonCode.trim() } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}), ...(payerReference.trim() ? { payerReference: payerReference.trim() } : {}),
        ...(partial && !perLine ? { approvedMinor: toMinor(total) ?? 0 } : {}),
        ...(partial && perLine ? { lines: claim.lines.filter((l) => lines[l.chargeId]?.trim()).map((l) => ({ chargeId: l.chargeId, approvedMinor: toMinor(lines[l.chargeId]) ?? 0 })) } : {}),
      });
      setOpen(false); onSaved();
    } catch (cause) { onError(describeError(cause)); } finally { setBusy(false); }
  };
  return <form aria-label="Payer decision" className="space-y-2 rounded-field border border-outline-soft p-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
    <p className="text-xs text-ink-soft">Record what the payer told you. Geneus does not decide claims.</p>
    <div className="grid gap-2 sm:grid-cols-3">
      <SelectField label="Decision" value={decision} options={PayerDecisionKind.options.map((d) => ({ value: d, label: DECISION_LABELS[d] }))} onChange={(e) => setDecision(e.target.value as PayerDecisionKind)} />
      <TextField label="Decided on" type="date" value={decidedOn} onChange={(e) => setDecidedOn(e.target.value)} />
      <TextField label="Payer's reference (optional)" value={payerReference} onChange={(e) => setPayerReference(e.target.value)} />
    </div>
    {decision === 'partially_approved' ? <div className="space-y-2">
      <label className="flex min-h-[40px] items-center gap-2 text-sm"><input type="checkbox" checked={perLine} onChange={(e) => setPerLine(e.target.checked)} />The payer itemised its decision by service</label>
      {perLine ? claim.lines.map((l) => <div key={l.chargeId} className="flex flex-wrap items-end gap-2"><span className="flex-1 text-sm">{l.description} · claimed {formatMoney(l.payerShareMinor, claim.currency)}</span>
        <div className="w-40"><TextField label="Approved" inputMode="decimal" placeholder="In full if blank" value={lines[l.chargeId] ?? ''} onChange={(e) => setLines((x) => ({ ...x, [l.chargeId]: typed(e.target.value) }))} /></div></div>)
        : <TextField label={`Total approved (claimed ${formatMoney(claim.payerShareMinor, claim.currency)})`} inputMode="decimal" value={total} onChange={(e) => setTotal(typed(e.target.value))} />}
    </div> : null}
    {decision !== 'approved' ? <div className="grid gap-2 sm:grid-cols-3"><TextField label="Payer's reason code" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)} /><div className="sm:col-span-2"><TextField label="Payer's reason" value={reason} onChange={(e) => setReason(e.target.value)} /></div></div> : null}
    <div className="flex gap-2"><Button type="submit" fullWidth={false} loading={busy}>Save decision</Button><Button type="button" variant="ghost" fullWidth={false} onClick={() => setOpen(false)}>Cancel</Button></div>
  </form>;
};

const ResolveDispute = ({ dispute, onSaved, onError }: { dispute: DisputeView; onSaved: () => void; onError: (m: string) => void }) => {
  const context = useAuthorizationContext();
  const [outcome, setOutcome] = useState<'payer_agreed' | 'payer_upheld' | 'withdrawn'>('payer_agreed'); const [note, setNote] = useState('');
  return <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); resolveDispute(context, { disputeId: dispute.id, outcome, note: note.trim() }).then(onSaved, (cause) => onError(describeError(cause))); }}>
    <div className="w-52"><SelectField label="Outcome" value={outcome} options={[{ value: 'payer_agreed', label: 'Payer agreed to pay' }, { value: 'payer_upheld', label: 'Payer kept its decision' }, { value: 'withdrawn', label: 'Hospital withdrew it' }]} onChange={(e) => setOutcome(e.target.value as typeof outcome)} /></div>
    <div className="min-w-[200px] flex-1"><TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} /></div>
    <Button type="submit" variant="outlined" fullWidth={false} disabled={note.trim().length < 3}>Resolve</Button>
  </form>;
};

const AmountForm = ({ label, action, max, currency, withReference, onSubmit }: { label: string; action: string; max: number; currency: string; withReference?: boolean; onSubmit: (amountMinor: number, reason: string, payerReference?: string) => Promise<void> }) => {
  const [amount, setAmount] = useState(''); const [reason, setReason] = useState(''); const [reference, setReference] = useState(''); const [busy, setBusy] = useState(false);
  const minor = toMinor(amount);
  return <form aria-label={label} className="space-y-2 rounded-field border border-outline-soft p-3" onSubmit={(e) => { e.preventDefault(); if (!minor) return; setBusy(true); void onSubmit(minor, reason.trim(), reference.trim() || undefined).finally(() => { setBusy(false); setAmount(''); setReason(''); setReference(''); }); }}>
    <p className="text-sm font-semibold">{label}</p>
    <TextField label={`Amount (up to ${formatMoney(Math.max(0, max), currency)})`} inputMode="decimal" value={amount} onChange={(e) => setAmount(typed(e.target.value))} />
    <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
    {withReference ? <TextField label="Payer's reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} /> : null}
    <Button type="submit" variant="outlined" fullWidth={false} loading={busy} disabled={!minor || minor > max || reason.trim().length < 3}>{action}</Button>
  </form>;
};
