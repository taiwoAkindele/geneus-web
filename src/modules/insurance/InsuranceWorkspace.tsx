import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuditEvent } from '@shared';
import { useLiveQuery } from '@/data';
import { allWhere } from '@/data/db';
import { Link } from 'react-router-dom';
import { LiabilityChange, isRoutine, serviceDateOf, type CoverCheck, type UndeterminedReason } from '@shared';
import { useBilling } from '@/modules/finance/billing/useBilling';
import { billingRows } from '@/modules/finance/billing/ledger';
import { confirmAllocations, SKIP_REASONS, VerificationRequired, type ConfirmOutcome } from '@/lib/api/insurance';
import { formatMoney } from '@/lib/money';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, TextAreaField, TextField, useToast } from '@/ui';
import { UNDETERMINED } from './coverageLabels';
import { StaffVerification } from './StaffVerification';
import { useDeviceInsurance } from './CoverCard';

type Row = ReturnType<typeof billingRows>[number];

/**
 * Making the patient liable for a charge that has cover (audit H3). It needs a
 * documented ground — a reason alone is never enough — and, where the payer
 * was expected to pay, a person allowed to approve liability changes. The
 * server checks all of it again.
 */
const LiabilityForm = ({ patientId, checks, canApprove, payerExpected, busy, disabled, onSubmit }: {
  patientId: string; checks: readonly CoverCheck[]; canApprove: boolean; payerExpected: boolean; busy: boolean; disabled: boolean; onSubmit: (liability: LiabilityChange) => void;
}) => {
  const [open, setOpen] = useState(false); const [ground, setGround] = useState<LiabilityChange['ground']>('patient_election');
  const [agreement, setAgreement] = useState(''); const [clause, setClause] = useState(''); const [checkId, setCheckId] = useState('');
  const notEligible = checks.filter((c) => c.patientId === patientId && c.result === 'not_eligible');
  if (!open) return <Button fullWidth={false} variant="ghost" onClick={() => setOpen(true)}>The patient should pay instead…</Button>;
  const needsApproval = payerExpected || ground === 'contract_clause';
  const liability = ground === 'patient_election' ? { ground, patientAgreement: agreement.trim() } : ground === 'not_eligible' ? { ground, coverCheckId: checkId } : { ground, contractClause: clause.trim() };
  const parsed = LiabilityChange.safeParse(liability);
  return <div className="space-y-2 rounded-field border border-outline-soft p-3">
    <SelectField label="On what ground?" value={ground} options={[
      { value: 'patient_election', label: 'The patient chose to pay, and the contract allows it' },
      { value: 'not_eligible', label: 'A recorded check found the cover not eligible' },
      { value: 'contract_clause', label: 'A clause of the contract makes the patient liable' },
    ]} onChange={(e) => setGround(e.target.value as LiabilityChange['ground'])} />
    {ground === 'patient_election' ? <TextField label="How the patient agreed (form, reference)" value={agreement} onChange={(e) => setAgreement(e.target.value)} /> : null}
    {ground === 'not_eligible' ? notEligible.length ? <SelectField label="The check" value={checkId} options={[{ value: '', label: 'Choose…' }, ...notEligible.map((c) => ({ value: c.id, label: `${c.coversFrom} to ${c.coversTo} · ${c.method}${c.reference ? ` · ${c.reference}` : ''}` }))]} onChange={(e) => setCheckId(e.target.value)} />
      : <p className="text-sm text-danger">No check has found this patient's cover not eligible. Record the check first.</p> : null}
    {ground === 'contract_clause' ? <TextField label="The contract clause" value={clause} onChange={(e) => setClause(e.target.value)} /> : null}
    {needsApproval && !canApprove ? <p className="text-sm text-amber-text">The payer is expected to pay this. Ask someone allowed to approve liability changes (usually the administrator).</p> : null}
    <p className="text-xs text-ink-soft">Missing hospital set-up is never a reason to charge the patient. A charge already on a claim must be revised off the claim first.</p>
    <div className="flex gap-2"><Button fullWidth={false} variant="outlined" loading={busy} disabled={disabled || !parsed.success || (needsApproval && !canApprove)} onClick={() => parsed.success && onSubmit(parsed.data)}>Make the patient liable</Button>
      <Button fullWidth={false} variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
  </div>;
};
type Visit = { key: string; patientId: string; name: string; date: string; rows: Row[] };

/**
 * The insurance officer's work, built from the records this device holds and
 * confirmed online. Routine visits are confirmed together; everything else is
 * reviewed one visit at a time with a reason. Nothing here is confirmed
 * automatically, and the server recalculates every confirmation itself.
 */
export const InsuranceWorkspace = () => {
  const context = useAuthorizationContext();
  const insurance = useDeviceInsurance();
  const toast = useToast();
  const query = useBilling();
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [reasons, setReasons] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<ConfirmOutcome[]>([]);
  useEffect(() => { document.title = 'Insurance · Geneus Health'; }, []);
  const data = query.data;
  // Payments the server flagged at sync for going beyond the patient's part: an older device, stale cover data, or undecided cover.
  const flags = useLiveQuery(useCallback(async () => new Set((await allWhere<AuditEvent>('audit_event', 'entityType', 'payment')).filter((e) => e.metadata?.context === 'insurance_payment_review').map((e) => e.entityId)), []), ['audit_event']);
  const view = useMemo(() => {
    if (!data) return undefined;
    const rows = billingRows(data.charges, data.payments, data.adjustments, data.coverage).filter((r) => r.coverage);
    const names = new Map(data.patients.map((p) => [p.patientId, p.fullName]));
    const visits = new Map<string, Visit>();
    for (const row of rows) {
      const date = serviceDateOf(row.charge.createdOn, data.insurance.timeZone) ?? row.charge.createdOn.slice(0, 10);
      const key = row.charge.encounterId ?? row.charge.appointmentId ?? `${row.charge.patientId}|${date}`;
      const visit = visits.get(key) ?? { key, patientId: row.charge.patientId, name: names.get(row.charge.patientId) ?? row.charge.patientId, date, rows: [] };
      visit.rows.push(row); visits.set(key, visit);
    }
    const paid = (r: Row) => r.settledMinor - r.refundedMinor;
    const open = [...visits.values()].filter((v) => v.rows.some((r) => r.coverage!.state === 'estimated'));
    const routine = open.filter((v) => v.rows.every((r) => r.coverage!.state !== 'estimated' || isRoutine(r.coverage!, paid(r))) && v.rows.some((r) => r.coverage!.state === 'estimated'));
    const exceptions = open.filter((v) => !routine.includes(v));
    const undetermined = new Map<UndeterminedReason, Row[]>();
    for (const r of rows) if (r.coverage!.state === 'undetermined') undetermined.set(r.coverage!.reason, [...(undetermined.get(r.coverage!.reason) ?? []), r]);
    const selfPaidWhileCovered = rows.filter((r) => r.coverage!.state === 'self_pay_elected' && data.insurance.checks.some((c) => {
      const cover = (r.coverage as { cover?: { id: string } }).cover; const date = serviceDateOf(r.charge.createdOn, data.insurance.timeZone);
      return cover && date && c.coverId === cover.id && c.result === 'verified' && c.coversFrom <= date && date <= c.coversTo;
    }));
    const credits = rows.filter((r) => r.balanceMinor < 0);
    return { routine, exceptions, undetermined, selfPaidWhileCovered, credits, names };
  }, [data]);

  if (insurance !== 'active' && insurance !== 'history') return <main className="p-4"><h1 className="text-xl font-bold">Insurance work</h1><p className="mt-2 text-sm">{insurance === 'setup' ? 'The hospital is setting up insurance. There is no insurance billing work until billing is activated.' : 'Insurance is off for this hospital.'} See <Link className="font-semibold text-brand" to="/settings/insurance/setup">Insurance settings</Link>.</p></main>;
  if (!view) return <main className="p-4"><p role="status">Loading insurance work…</p></main>;
  const canConfirm = context.permissions.includes('coverage:confirm');
  const money = (rows: Row[], pick: (r: Row) => number) => [...new Set(rows.map((r) => r.charge.currency))].map((c) => formatMoney(rows.filter((r) => r.charge.currency === c).reduce((n, r) => n + pick(r), 0), c)).join(' + ');
  const run = async (key: string, input: Parameters<typeof confirmAllocations>[1]) => {
    setBusy(key); setError('');
    try {
      const result = await confirmAllocations(context, input);
      setOutcomes(result.outcomes);
      const confirmed = result.outcomes.filter((o) => o.outcome === 'confirmed').length;
      toast(`${confirmed} charge${confirmed === 1 ? '' : 's'} confirmed${result.outcomes.length > confirmed ? `, ${result.outcomes.length - confirmed} need review` : ''}. Changes arrive with the next sync.`);
    } catch (cause) { setError(cause instanceof VerificationRequired ? 'Your session with the server ended. Confirm your PIN to continue.' : cause instanceof Error ? cause.message : 'Confirmation failed'); }
    finally { setBusy(''); }
  };
  const visitLine = (v: Visit) => <p className="text-sm">{v.date} · {v.rows.length} charge{v.rows.length === 1 ? '' : 's'} · patient pays {money(v.rows, (r) => r.coverage!.state === 'estimated' ? r.coverage!.patientShareMinor : 0)}</p>;
  const routineIds = view.routine.flatMap((v) => v.rows.filter((r) => r.coverage!.state === 'estimated').map((r) => r.charge.id));

  return <main className="mx-auto max-w-4xl space-y-6 p-4">
    <header className="flex flex-wrap items-end justify-between gap-2"><div><h1 className="text-2xl font-extrabold">Insurance work</h1><p className="text-sm text-ink-soft">Confirm insurance splits, resolve undecided cover and refund credits.</p></div>
      {context.permissions.some((p) => p.startsWith('insurance_contract:')) ? <Link className="font-bold text-brand underline" to="/settings/insurance/payers">Payers &amp; contracts</Link> : null}</header>
    {error ? <p role="alert" className="rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
    {outcomes.some((o) => o.outcome === 'skipped') ? <section aria-label="Needs review" className="rounded-card border border-amber-border bg-amber-bg p-3 text-sm"><p className="font-bold">Not confirmed</p><ul>{outcomes.filter((o): o is Extract<ConfirmOutcome, { outcome: 'skipped' }> => o.outcome === 'skipped').map((o) => <li key={o.chargeId}>{data?.charges.find((c) => c.id === o.chargeId)?.description ?? o.chargeId}: {SKIP_REASONS[o.reason] ?? (o.reason.startsWith('undetermined:') ? UNDETERMINED[o.reason.slice(13) as UndeterminedReason]?.label ?? o.reason : o.reason)}</li>)}</ul></section> : null}

    <section aria-label="Routine visits" className="space-y-3">
      <h2 className="text-lg font-bold">Routine visits ({view.routine.length})</h2>
      <p className="text-sm text-ink-soft">Verified cover, calculable terms, no approval needed, no choice recorded and nothing overpaid.</p>
      {view.routine.length === 0 ? <p className="text-sm">Nothing routine is waiting.</p> : <>
        <ul className="divide-y divide-outline-soft rounded-card border border-outline-soft bg-white">{view.routine.map((v) => <li key={v.key} className="p-3"><p className="font-semibold">{v.name}</p>{visitLine(v)}</li>)}</ul>
        {canConfirm ? <StaffVerification purpose="Confirming insurance splits"><Button loading={busy === 'routine'} disabled={Boolean(busy)} onClick={() => void run('routine', { chargeIds: routineIds, basis: 'routine_bulk' })}>Confirm {view.routine.length} routine visit{view.routine.length === 1 ? '' : 's'}</Button></StaffVerification> : null}
      </>}
    </section>

    <section aria-label="Exceptions" className="space-y-3">
      <h2 className="text-lg font-bold">Needs review ({view.exceptions.length + view.selfPaidWhileCovered.length})</h2>
      {view.exceptions.length + view.selfPaidWhileCovered.length === 0 ? <p className="text-sm">No exceptions.</p> : null}
      {[...view.exceptions.map((v) => ({ key: v.key, name: v.name, rows: v.rows.filter((r) => r.coverage!.state === 'estimated'), detail: visitLine(v), why: v.rows.some((r) => r.coverage!.state === 'estimated' && r.coverage!.line.approvalRequired) ? 'Needs the payer’s approval' : v.rows.some((r) => r.settledMinor - r.refundedMinor > (r.coverage!.state === 'estimated' ? r.coverage!.patientShareMinor : 0)) ? 'Paid more than the patient share' : 'A cover choice was recorded' })),
        ...view.selfPaidWhileCovered.map((r) => ({ key: `self:${r.charge.id}`, name: view.names.get(r.charge.patientId) ?? r.charge.patientId, rows: [r], detail: <p className="text-sm">{r.charge.description}</p>, why: 'Paid without insurance, but cover was verified for that date' })),
      ].map((item) => <article key={item.key} className="space-y-2 rounded-card border border-outline-soft bg-white p-3">
        <p className="font-semibold">{item.name}</p>{item.detail}<p className="text-sm text-amber-text">{item.why}</p>
        {canConfirm ? <StaffVerification purpose="Reviewing an insurance exception">
          <TextAreaField label="Reason for your decision" value={reasons[item.key] ?? ''} onChange={(e) => setReasons((v) => ({ ...v, [item.key]: e.target.value }))} />
          <div className="flex flex-wrap gap-2">
            <Button fullWidth={false} loading={busy === item.key + ':cover'} disabled={Boolean(busy) || !reasons[item.key]?.trim()} onClick={() => void run(item.key + ':cover', { chargeIds: item.rows.map((r) => r.charge.id), basis: 'exception', decision: 'apply_cover', reason: reasons[item.key] })}>Apply cover</Button>
          </div>
          <LiabilityForm patientId={item.rows[0]?.charge.patientId ?? ''} checks={data?.insurance.checks ?? []} canApprove={context.permissions.includes('coverage:approve_liability_change')}
            payerExpected={item.rows.some((r) => r.coverage!.state === 'estimated')} busy={busy === item.key + ':self'} disabled={Boolean(busy) || !reasons[item.key]?.trim()}
            onSubmit={(liability) => void run(item.key + ':self', { chargeIds: item.rows.map((r) => r.charge.id), basis: 'exception', decision: 'self_pay', reason: reasons[item.key], liability })} />
        </StaffVerification> : null}
      </article>)}
    </section>

    <section aria-label="Undecided cover" className="space-y-3">
      <h2 className="text-lg font-bold">Undecided cover</h2>
      {view.undetermined.size === 0 ? <p className="text-sm">Every insured charge has a decision or an estimate.</p> : [...view.undetermined].map(([reason, rows]) => <article key={reason} className="rounded-card border border-outline-soft bg-white p-3">
        <h3 className="font-semibold">{UNDETERMINED[reason].label} ({rows.length})</h3><p className="text-sm text-ink-soft">{UNDETERMINED[reason].next}</p>
        <ul className="mt-2 space-y-1 text-sm">{rows.slice(0, 20).map((r) => <li key={r.charge.id}><Link className="text-brand underline" to={`/patients/profile?patient=${encodeURIComponent(r.charge.patientId)}&tab=details`}>{view.names.get(r.charge.patientId) ?? r.charge.patientId}</Link> · {r.charge.description} · {formatMoney(r.undeterminedMinor, r.charge.currency)}
          {reason === 'not_eligible' && canConfirm ? <StaffVerification purpose="Recording that the patient pays"><TextAreaField label="Reason for your decision" value={reasons[r.charge.id] ?? ''} onChange={(e) => setReasons((v) => ({ ...v, [r.charge.id]: e.target.value }))} />
            <LiabilityForm patientId={r.charge.patientId} checks={data?.insurance.checks ?? []} canApprove={context.permissions.includes('coverage:approve_liability_change')} payerExpected={false}
              busy={busy === r.charge.id} disabled={Boolean(busy) || !reasons[r.charge.id]?.trim()} onSubmit={(liability) => void run(r.charge.id, { chargeIds: [r.charge.id], basis: 'exception', decision: 'self_pay', reason: reasons[r.charge.id], liability })} /></StaffVerification> : null}</li>)}</ul>
      </article>)}
    </section>

    <section aria-label="Credits to refund" className="space-y-3">
      <h2 className="text-lg font-bold">Credits to refund ({view.credits.length})</h2>
      {view.credits.length === 0 ? <p className="text-sm">No credits on insured charges.</p> : <ul className="divide-y divide-outline-soft rounded-card border border-outline-soft bg-white">{view.credits.map((r) => <li key={r.charge.id} className="p-3 text-sm"><Link className="font-semibold text-brand underline" to={`/billing?tab=collections&patient=${encodeURIComponent(r.charge.patientId)}`}>{view.names.get(r.charge.patientId) ?? r.charge.patientId}</Link> · {r.charge.description} · credit {formatMoney(-r.balanceMinor, r.charge.currency)}{r.final ? '' : ' · refundable once confirmed'}
        <ul className="mt-1 text-xs text-ink-muted">{(data?.payments ?? []).filter((p) => !p.reverses && p.method !== 'waiver' && p.allocations.some((a) => a.chargeId === r.charge.id)).map((p) => <li key={p.id}>{p.receiptNumber} · {formatMoney(p.allocations.find((a) => a.chargeId === r.charge.id)!.amountMinor, p.currency)} collected by {data?.staff.find((st) => st.staffId === p.createdBy)?.fullName ?? p.createdBy} on device {p.deviceId}{flags.data?.has(p.id) ? <strong className="text-amber-text"> · flagged at sync: more than the patient's part</strong> : null}</li>)}</ul></li>)}</ul>}
    </section>
  </main>;
};
