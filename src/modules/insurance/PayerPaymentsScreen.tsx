import { useCallback, useEffect, useMemo, useState } from 'react';
import { RemittanceMethod, type Payer, type RemittanceMatch, type RemittanceRow } from '@shared';
import { useLiveQuery } from '@/data';
import { listPayers } from '@/data/repos/insurance';
import {
  SETTLEMENT_LABELS, allocateRemittance, listImportTemplates, listRemittances, matchRemittance, outstandingClaims, recordPayerDecision, recordRemittance, reverseRemittance, saveImportTemplate, VerificationRequired,
  type OutstandingClaim, type OutstandingTotals, type RemittanceView,
} from '@/lib/api/insurance';
import { formatMoney, parseAmount } from '@/lib/money';
import { columnName, detectHeaderRow, mappedRows, missingRequired, suggestMapping, templateFits, type ColumnMapping, type FieldSpec } from '@/lib/tabular/mapping';
import { readTableFile, type TableFile } from '@/lib/tabular/readTable';
import { downloadTable } from '@/lib/tabular/exportTable';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, TextField, useToast } from '@/ui';
import { StaffVerification } from './StaffVerification';
import { useDeviceInsurance } from './CoverCard';

const describeError = (cause: unknown) => cause instanceof VerificationRequired ? 'Your session with the server ended. Confirm your PIN to continue.' : cause instanceof Error ? cause.message : 'The request failed';
const today = () => new Date().toISOString().slice(0, 10);
const toMinor = (value: string, currency = 'NGN'): number | undefined => { const v = value.replace(/[,\s₦]/g, ''); if (!v) return undefined; try { return parseAmount(v, currency); } catch { return undefined; } };
const typed = (value: string) => value.replace(/[^\d.]/g, '');
const METHOD_LABELS: Record<string, string> = { transfer: 'Bank transfer', cheque: 'Cheque', cash: 'Cash', other: 'Other' };

export const REMITTANCE_COLUMNS: FieldSpec[] = [
  { key: 'claimNumber', label: 'Claim number', synonyms: ['claim number', 'claim no', 'claim id', 'claim ref', 'hospital claim number', 'provider claim number'] },
  { key: 'enrolleeNumber', label: 'Enrollee number', synonyms: ['enrollee', 'enrollee number', 'enrolee id', 'member id', 'membership number', 'nhis number'] },
  { key: 'approvedAmount', label: 'Approved amount', synonyms: ['approved', 'approved amount', 'amount approved', 'vetted amount', 'allowed'] },
  { key: 'deductedAmount', label: 'Deducted amount', synonyms: ['deducted', 'deduction', 'disallowed', 'rejected amount'] },
  { key: 'paidAmount', label: 'Paid amount', required: true, synonyms: ['paid', 'amount paid', 'payment', 'net paid', 'paid amount'] },
  { key: 'reasonCode', label: 'Reason code', synonyms: ['reason code', 'code', 'remark code'] },
  { key: 'reason', label: 'Reason', synonyms: ['reason', 'remark', 'remarks', 'comment', 'comments'] },
];

/** Mapped spreadsheet rows as remittance rows, amounts in minor units. Unreadable amounts are left out for a person to see. */
export const remittanceRows = (rows: readonly { sourceRow: number; values: Record<string, string> }[], currency = 'NGN'): RemittanceRow[] =>
  rows.filter((r) => Object.values(r.values).some((v) => v.trim())).map((r) => {
    const v = r.values; const amount = (k: string) => (v[k] ? toMinor(v[k], currency) : undefined);
    const approved = amount('approvedAmount'), deducted = amount('deductedAmount'), paid = amount('paidAmount');
    return { sourceRow: r.sourceRow, ...(v.claimNumber?.trim() ? { claimNumber: v.claimNumber.trim() } : {}), ...(v.enrolleeNumber?.trim() ? { enrolleeNumber: v.enrolleeNumber.trim() } : {}),
      ...(approved !== undefined ? { approvedMinor: approved } : {}), ...(deducted !== undefined ? { deductedMinor: deducted } : {}), ...(paid !== undefined ? { paidMinor: paid } : {}),
      ...(v.reasonCode?.trim() ? { reasonCode: v.reasonCode.trim() } : {}), ...(v.reason?.trim() ? { reason: v.reason.trim() } : {}) };
  });

/**
 * Money received from payers and what payers still owe. Payer payments are
 * kept apart from patient payments: nothing here changes a patient's account,
 * and an unpaid or rejected amount never becomes the patient's debt.
 */
export const PayerPaymentsScreen = () => {
  const insurance = useDeviceInsurance();
  useEffect(() => { document.title = 'Payer payments · Geneus Health'; }, []);
  if (insurance !== 'active' && insurance !== 'history') return <main className="p-4"><h1 className="text-xl font-bold">Payer payments</h1><p className="mt-2 text-sm">Payer payments start once insurance billing is active.</p></main>;
  return <main className="mx-auto max-w-6xl space-y-6 p-4">
    <header><h1 className="text-2xl font-extrabold">Payer payments</h1><p className="text-sm text-ink-soft">Record what payers paid, match it to claims and follow up what is still owed. Payer money never enters a patient's account.</p></header>
    <StaffVerification purpose="Payer payments"><Body /></StaffVerification>
  </main>;
};

const Body = () => {
  const context = useAuthorizationContext();
  const payers = useLiveQuery(useCallback(() => listPayers(), []), ['payer']).data ?? [];
  const [tab, setTab] = useState<'outstanding' | 'payments' | 'import'>('outstanding');
  const [error, setError] = useState('');
  const [claims, setClaims] = useState<OutstandingClaim[]>(); const [totals, setTotals] = useState<OutstandingTotals>({});
  const [remittances, setRemittances] = useState<RemittanceView[]>();
  const load = useCallback(async () => {
    try {
      const [o, r] = await Promise.all([outstandingClaims(context), listRemittances(context)]);
      setClaims(o.claims); setTotals(o.totals); setRemittances(r.remittances); setError('');
    } catch (cause) { setError(describeError(cause)); }
  }, [context]);
  useEffect(() => { void load(); }, [load]);
  const payerName = (id: string) => payers.find((p) => p.id === id)?.name ?? id;
  return <div className="space-y-5">
    {error ? <p role="alert" className="rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
    <div role="tablist" className="flex flex-wrap gap-2">{([['outstanding', 'What payers owe'], ['payments', 'Payments received'], ['import', 'Import a payment advice']] as const).map(([key, label]) =>
      <Button key={key} role="tab" aria-selected={tab === key} variant={tab === key ? 'secondary' : 'ghost'} fullWidth={false} onClick={() => setTab(key)}>{label}</Button>)}</div>
    {tab === 'outstanding' ? <Outstanding claims={claims} totals={totals} payerName={payerName} /> : null}
    {tab === 'payments' ? <Payments payers={payers} claims={claims ?? []} remittances={remittances} payerName={payerName} onChanged={load} onError={setError} /> : null}
    {tab === 'import' ? <ImportAdvice payers={payers} claims={claims ?? []} onChanged={load} onError={setError} /> : null}
  </div>;
};

const Outstanding = ({ claims, totals, payerName }: { claims?: OutstandingClaim[]; totals: OutstandingTotals; payerName: (id: string) => string }) => {
  const [status, setStatus] = useState(''); const [payer, setPayer] = useState('');
  if (!claims) return <p role="status">Loading…</p>;
  const shown = claims.filter((c) => (!status || (status === 'overdue' ? c.settlement.overdue : c.settlement.status === status)) && (!payer || c.payerId === payer));
  const save = () => downloadTable(`payer-balances-${today()}.xlsx`, 'Payer balances', [
    ['Payer', 'Claim', 'Revision', 'Patient', 'Enrollee', 'Services', 'Status', 'Claimed', 'Approved', 'Deducted', 'Received', 'Disputed', 'Written off', 'Outstanding', 'Payer owes', 'Overdue'],
    ...shown.map((c) => [payerName(c.payerId), c.claimNumber, c.revision, c.patientName, c.enrolleeNumber, `${c.serviceFrom} – ${c.serviceTo}`, SETTLEMENT_LABELS[c.settlement.status],
      c.settlement.expectedMinor / 100, c.settlement.approvedMinor === undefined ? '' : c.settlement.approvedMinor / 100, c.settlement.deductedMinor / 100, c.settlement.paidMinor / 100,
      c.settlement.disputedMinor / 100, c.settlement.writtenOffMinor / 100, c.settlement.outstandingMinor / 100, c.settlement.payerOwesMinor / 100, c.settlement.overdue ? 'Yes' : '']),
  ]);
  return <div className="space-y-4">
    <section aria-label="Totals by payer" className="grid gap-3 md:grid-cols-2">{Object.entries(totals).map(([key, t]) => { const [payerId, currency] = key.split('|'); const m = (n: number) => formatMoney(n, currency);
      return <article key={key} data-payer={payerId} className="rounded-card border border-outline-soft bg-white p-4 text-sm">
        <h2 className="font-bold">{payerName(payerId)}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
          <dt className="text-ink-soft">Claimed</dt><dd>{m(t.expected)}</dd><dt className="text-ink-soft">Approved</dt><dd>{m(t.approved)}</dd>
          <dt className="text-ink-soft">Deducted</dt><dd>{m(t.deducted)}</dd><dt className="text-ink-soft">Received</dt><dd>{m(t.paid)}</dd>
          <dt className="text-ink-soft">Disputed</dt><dd>{m(t.disputed)}</dd><dt className="text-ink-soft">Written off</dt><dd>{m(t.writtenOff)}</dd>
          <dt className="font-semibold">Outstanding</dt><dd data-testid="payer-outstanding" className="font-semibold">{m(t.outstanding)}</dd><dt className="text-ink-soft">Overdue</dt><dd className={t.overdue ? 'text-danger' : ''}>{m(t.overdue)}</dd>
        </dl></article>; })}
      {Object.keys(totals).length === 0 ? <p className="text-sm">No submitted claims yet.</p> : null}</section>
    <div className="flex flex-wrap items-end gap-2">
      <div className="w-56"><SelectField label="Payer" value={payer} options={[{ value: '', label: 'All payers' }, ...[...new Set(claims.map((c) => c.payerId))].map((id) => ({ value: id, label: payerName(id) }))]} onChange={(e) => setPayer(e.target.value)} /></div>
      <div className="w-56"><SelectField label="Show" value={status} options={[{ value: '', label: 'All claims with the payer' }, { value: 'overdue', label: 'Overdue' }, ...Object.entries(SETTLEMENT_LABELS).filter(([k]) => k !== 'not_submitted').map(([value, label]) => ({ value, label }))]} onChange={(e) => setStatus(e.target.value)} /></div>
      <Button variant="outlined" fullWidth={false} disabled={!shown.length} onClick={() => void save()}>Download as Excel</Button>
    </div>
    <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-outline-soft"><th className="p-2">Claim</th><th className="p-2">Patient</th><th className="p-2">Payer</th><th className="p-2">Status</th><th className="p-2">Claimed</th><th className="p-2">Approved</th><th className="p-2">Received</th><th className="p-2">Outstanding</th></tr></thead>
      <tbody>{shown.map((c) => <tr key={c.id} data-claim={c.claimNumber} className="border-b border-outline-soft"><td className="p-2 font-semibold">{c.claimNumber}{c.revision > 1 ? ` r${c.revision}` : ''}</td><td className="p-2">{c.patientName}<span className="block text-xs text-ink-soft">{c.enrolleeNumber}</span></td>
        <td className="p-2">{payerName(c.payerId)}</td><td className="p-2">{SETTLEMENT_LABELS[c.settlement.status]}{c.settlement.overdue ? <span className="block text-xs text-danger">Overdue</span> : null}</td>
        <td className="p-2">{formatMoney(c.settlement.expectedMinor, c.currency)}</td><td className="p-2">{c.settlement.approvedMinor === undefined ? '—' : formatMoney(c.settlement.approvedMinor, c.currency)}</td>
        <td className="p-2">{formatMoney(c.settlement.paidMinor, c.currency)}</td><td className="p-2 font-semibold">{formatMoney(c.settlement.outstandingMinor, c.currency)}</td></tr>)}</tbody></table></div>
  </div>;
};

/** Amount inputs for claims a payment can settle, never more than each has outstanding. */
const AllocationInputs = ({ claims, values, onChange, currency }: { claims: OutstandingClaim[]; values: Record<string, string>; onChange: (v: Record<string, string>) => void; currency: string }) =>
  claims.length === 0 ? <p className="text-sm">No claims of this payer have anything outstanding.</p> : <div className="max-h-80 space-y-1 overflow-y-auto">{claims.map((c) => {
    const v = values[c.id] ?? ''; const minor = toMinor(v, currency); const over = minor !== undefined && minor > c.settlement.outstandingMinor;
    return <div key={c.id} className="flex flex-wrap items-end gap-2 text-sm"><span className="min-w-[220px] flex-1">{c.claimNumber}{c.revision > 1 ? ` r${c.revision}` : ''} · {c.patientName} · outstanding {formatMoney(c.settlement.outstandingMinor, c.currency)}</span>
      <div className="w-36"><TextField label={`Amount for ${c.claimNumber}`} inputMode="decimal" value={v} onChange={(e) => onChange({ ...values, [c.id]: typed(e.target.value) })} /></div>
      <Button variant="ghost" fullWidth={false} onClick={() => onChange({ ...values, [c.id]: (c.settlement.outstandingMinor / 100).toFixed(2) })}>Full</Button>
      {over ? <span className="text-xs text-danger">More than outstanding</span> : null}</div>;
  })}</div>;
const allocationsFrom = (values: Record<string, string>, currency: string) => Object.entries(values).flatMap(([claimId, v]) => { const n = toMinor(v, currency); return n && n > 0 ? [{ claimId, amountMinor: n }] : []; });

const Payments = ({ payers, claims, remittances, payerName, onChanged, onError }: { payers: Payer[]; claims: OutstandingClaim[]; remittances?: RemittanceView[]; payerName: (id: string) => string; onChanged: () => Promise<void>; onError: (m: string) => void }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [payerId, setPayerId] = useState(''); const [reference, setReference] = useState(''); const [receivedOn, setReceivedOn] = useState(today()); const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'transfer' | 'cheque' | 'cash' | 'other'>('transfer'); const [account, setAccount] = useState(''); const [note, setNote] = useState('');
  const [values, setValues] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(''); const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [allocating, setAllocating] = useState(''); const [later, setLater] = useState<Record<string, string>>({}); const [reversing, setReversing] = useState(''); const [reason, setReason] = useState('');
  const currency = 'NGN';
  const open = claims.filter((c) => c.payerId === payerId && c.settlement.outstandingMinor > 0);
  const allocations = allocationsFrom(values, currency);
  const total = toMinor(amount, currency) ?? 0; const allocated = allocations.reduce((n, a) => n + a.amountMinor, 0);
  const record = async () => {
    setBusy('record');
    try {
      const r = await recordRemittance(context, { payerId, receivedOn, reference: reference.trim(), amountMinor: total, currency, method, ...(account.trim() ? { receivingAccount: account.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}), allocations, requestKey });
      toast(`Payment recorded: ${formatMoney(r.allocatedMinor, currency)} allocated${r.unallocatedMinor ? `, ${formatMoney(r.unallocatedMinor, currency)} still to match` : ''}.`);
      setReference(''); setAmount(''); setValues({}); setNote(''); setRequestKey(crypto.randomUUID()); await onChanged();
    } catch (cause) { onError(describeError(cause)); } finally { setBusy(''); }
  };
  return <div className="space-y-6">
    {context.permissions.includes('insurance_remittance:record') ? <section aria-label="Record a payer payment" className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
      <h2 className="text-lg font-bold">Record a payment from a payer</h2>
      <div className="grid gap-2 sm:grid-cols-3">
        <SelectField label="Payer" value={payerId} options={[{ value: '', label: 'Choose…' }, ...payers.map((p) => ({ value: p.id, label: p.name }))]} onChange={(e) => { setPayerId(e.target.value); setValues({}); }} />
        <TextField label="Payment or advice reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        <TextField label="Received on" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
        <TextField label="Amount received" inputMode="decimal" value={amount} onChange={(e) => setAmount(typed(e.target.value))} />
        <SelectField label="Received by" value={method} options={RemittanceMethod.options.map((m) => ({ value: m, label: METHOD_LABELS[m] }))} onChange={(e) => setMethod(e.target.value as typeof method)} />
        <TextField label="Into account (optional)" value={account} onChange={(e) => setAccount(e.target.value)} />
      </div>
      <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {payerId ? <><h3 className="font-semibold">Which claims it pays</h3><AllocationInputs claims={open} values={values} onChange={setValues} currency={currency} />
        <p className="text-sm">Allocated {formatMoney(allocated, currency)} of {formatMoney(total, currency)}{total > allocated ? ` · ${formatMoney(total - allocated, currency)} stays unallocated until matched` : ''}</p></> : null}
      {allocated > total ? <p className="text-sm text-danger">More is allocated than was received.</p> : null}
      <Button fullWidth={false} loading={busy === 'record'} disabled={!payerId || !reference.trim() || !total || allocated > total} onClick={() => void record()}>Record payment</Button>
    </section> : null}
    <section aria-label="Payments received" className="space-y-2"><h2 className="text-lg font-bold">Payments received</h2>
      {!remittances ? <p role="status">Loading…</p> : remittances.length === 0 ? <p className="text-sm">No payer payments recorded yet.</p> : remittances.map((r) => <article key={r.id} data-remittance={r.reference} className={`space-y-2 rounded-field border bg-white p-3 text-sm ${r.reversed ? 'border-outline-soft opacity-70' : 'border-outline-soft'}`}>
        <p><strong>{r.reference}</strong> · {payerName(r.payerId)} · {formatMoney(r.amountMinor, r.currency)} · {METHOD_LABELS[r.method] ?? r.method} · received {r.receivedOn}{r.receivingAccount ? ` · ${r.receivingAccount}` : ''}</p>
        {r.reversed ? <p className="text-danger">Reversed {r.reversed.on.slice(0, 10)}: {r.reversed.reason}</p> : <p>Allocated {formatMoney(r.allocatedMinor, r.currency)}{r.unallocatedMinor ? <strong className="text-amber-text"> · {formatMoney(r.unallocatedMinor, r.currency)} unallocated</strong> : ''}</p>}
        {r.allocations.length ? <ul className="text-xs text-ink-soft">{r.allocations.map((a, i) => <li key={i}>{a.claimNumber}{a.revision > 1 ? ` r${a.revision}` : ''} · {formatMoney(a.amountMinor, r.currency)}</li>)}</ul> : null}
        {!r.reversed && context.permissions.includes('insurance_remittance:record') ? <div className="flex flex-wrap gap-2">
          {r.unallocatedMinor > 0 ? <Button variant="ghost" fullWidth={false} onClick={() => { setAllocating(allocating === r.id ? '' : r.id); setLater({}); }}>{allocating === r.id ? 'Cancel' : 'Allocate the rest'}</Button> : null}
          <Button variant="ghost" fullWidth={false} onClick={() => { setReversing(reversing === r.id ? '' : r.id); setReason(''); }}>{reversing === r.id ? 'Cancel' : 'Recorded in error…'}</Button>
        </div> : null}
        {allocating === r.id ? <div className="space-y-2"><AllocationInputs claims={claims.filter((c) => c.payerId === r.payerId && c.settlement.outstandingMinor > 0)} values={later} onChange={setLater} currency={r.currency} />
          <Button fullWidth={false} loading={busy === r.id} disabled={!allocationsFrom(later, r.currency).length} onClick={() => { setBusy(r.id); allocateRemittance(context, { remittanceId: r.id, allocations: allocationsFrom(later, r.currency) })
            .then(async () => { toast('Allocated.'); setAllocating(''); await onChanged(); }, (cause) => onError(describeError(cause))).finally(() => setBusy('')); }}>Save allocation</Button></div> : null}
        {reversing === r.id ? <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); reverseRemittance(context, r.id, reason.trim()).then(async () => { toast('Payment reversed. Record the correct one if needed.'); setReversing(''); await onChanged(); }, (cause) => onError(describeError(cause))); }}>
          <div className="min-w-[240px] flex-1"><TextField label="Why it was recorded in error" value={reason} onChange={(e) => setReason(e.target.value)} /></div><Button type="submit" variant="outlined" fullWidth={false} disabled={reason.trim().length < 3}>Reverse payment</Button></form> : null}
      </article>)}
    </section>
  </div>;
};

type Review = RemittanceMatch & { claimId?: string; accept: boolean };

/**
 * A payer's payment advice, read on this device and matched on the server.
 * Only rows naming one of the payer's claim numbers are suggested as exact;
 * every row is still confirmed by a person before anything is recorded.
 */
const ImportAdvice = ({ payers, claims, onChanged, onError }: { payers: Payer[]; claims: OutstandingClaim[]; onChanged: () => Promise<void>; onError: (m: string) => void }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [payerId, setPayerId] = useState(''); const [file, setFile] = useState<TableFile>(); const [sheetIndex, setSheetIndex] = useState(0); const [headerRow, setHeaderRow] = useState(0); const [mapping, setMapping] = useState<ColumnMapping>({});
  const [review, setReview] = useState<Review[]>(); const [reference, setReference] = useState(''); const [receivedOn, setReceivedOn] = useState(today()); const [method, setMethod] = useState<'transfer' | 'cheque' | 'cash' | 'other'>('transfer');
  const [amount, setAmount] = useState(''); const [decisions, setDecisions] = useState(true); const [busy, setBusy] = useState(false); const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [templateName, setTemplateName] = useState('');
  const sheet = file?.sheets[sheetIndex]; const headers = sheet?.rows[headerRow] ?? [];
  const rows = useMemo(() => sheet ? remittanceRows(mappedRows(sheet.rows, headerRow, mapping)) : [], [sheet, headerRow, mapping]);
  const byId = new Map(claims.map((c) => [c.id, c]));
  const choose = async (chosen?: File) => {
    if (!chosen) return;
    setReview(undefined); setFile(undefined);
    try {
      const table = await readTableFile(chosen); const target = table.sheets[0];
      const templates = (await listImportTemplates(context, 'remittance')).templates.filter((t) => !t.payerId || t.payerId === payerId);
      const fitting = templates.find((t) => templateFits(t, target.rows));
      if (fitting) { setHeaderRow(fitting.headerRow); setMapping(fitting.mapping); setTemplateName(fitting.name); }
      else { const header = detectHeaderRow(target.rows, REMITTANCE_COLUMNS); setHeaderRow(header); setMapping(suggestMapping(target.rows[header] ?? [], REMITTANCE_COLUMNS)); setTemplateName(`${payers.find((p) => p.id === payerId)?.name ?? 'Payer'} payment advice`); }
      setFile(table); setSheetIndex(0); setRequestKey(crypto.randomUUID());
    } catch (cause) { onError(describeError(cause)); }
  };
  const match = async () => {
    try {
      const { matches } = await matchRemittance(context, payerId, rows);
      setReview(matches.map((m) => ({ ...m, accept: m.confidence === 'exact' })));
      setAmount(((matches.reduce((n, m) => n + (m.paidMinor ?? 0), 0)) / 100).toFixed(2));
      if (templateName.trim()) await saveImportTemplate(context, { kind: 'remittance', payerId, name: templateName.trim(), headers: headers.map((h) => h.slice(0, 200)), headerRow, mapping }).catch(() => undefined);
    } catch (cause) { onError(describeError(cause)); }
  };
  const accepted = (review ?? []).filter((r) => r.accept && r.claimId && r.paidMinor);
  const total = toMinor(amount) ?? 0; const allocated = accepted.reduce((n, r) => n + (r.paidMinor ?? 0), 0);
  const record = async () => {
    setBusy(true);
    try {
      const result = await recordRemittance(context, { payerId, receivedOn, reference: reference.trim(), amountMinor: total, currency: 'NGN', method,
        allocations: accepted.map((r) => ({ claimId: r.claimId!, amountMinor: r.paidMinor! })), source: { fileName: file!.fileName, sha256: file!.sha256, rows: rows.length }, requestKey });
      // The advice's approved amounts become the payer's recorded decisions, only for confirmed rows.
      let decided = 0;
      if (decisions) for (const r of accepted.filter((x) => x.approvedMinor !== undefined)) {
        const claim = byId.get(r.claimId!); if (!claim || claim.settlement.approvedMinor !== undefined) continue;
        const full = r.approvedMinor! >= claim.settlement.expectedMinor;
        await recordPayerDecision(context, { claimId: claim.id, decision: full ? 'approved' : 'partially_approved', decidedOn: receivedOn, payerReference: reference.trim(),
          ...(full ? {} : { approvedMinor: r.approvedMinor!, reason: (review ?? []).find((x) => x.sourceRow === r.sourceRow)?.problems.join('; ') || 'Per payment advice' }) }).then(() => { decided += 1; }, () => undefined);
      }
      toast(`Payment recorded: ${accepted.length} claim${accepted.length === 1 ? '' : 's'} paid${result.unallocatedMinor ? `, ${formatMoney(result.unallocatedMinor, 'NGN')} unallocated` : ''}${decided ? `, ${decided} decision${decided === 1 ? '' : 's'} recorded` : ''}.`);
      setReview(undefined); setFile(undefined); setReference(''); setRequestKey(crypto.randomUUID()); await onChanged();
    } catch (cause) { onError(describeError(cause)); } finally { setBusy(false); }
  };
  return <section aria-label="Import a payment advice" className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
    <h2 className="text-lg font-bold">Import a payer's payment advice</h2>
    <p className="text-sm text-ink-soft">Upload the payer's settlement spreadsheet. Rows naming one of your claim numbers are suggested; everything else waits for you. Nothing is recorded until you confirm.</p>
    <SelectField label="Payer" value={payerId} options={[{ value: '', label: 'Choose…' }, ...payers.map((p) => ({ value: p.id, label: p.name }))]} onChange={(e) => { setPayerId(e.target.value); setFile(undefined); setReview(undefined); }} />
    {payerId ? <label className="block text-sm"><span className="font-semibold">Payment advice (CSV or Excel)</span><input className="mt-1 block w-full text-sm" type="file" accept=".csv,.xlsx,.xls" onChange={(e) => void choose(e.target.files?.[0])} /></label> : null}
    {file && sheet && !review ? <div className="space-y-2 rounded-field border border-outline-soft p-3">
      {file.sheets.length > 1 ? <SelectField label="Sheet" value={String(sheetIndex)} options={file.sheets.map((s, i) => ({ value: String(i), label: s.name }))} onChange={(e) => setSheetIndex(Number(e.target.value))} /> : null}
      <TextField label="Header row" inputMode="numeric" value={String(headerRow + 1)} onChange={(e) => setHeaderRow(Math.max(0, Number(e.target.value.replace(/\D/g, '') || 1) - 1))} />
      <div className="grid gap-2 sm:grid-cols-2">{REMITTANCE_COLUMNS.map((f) => <SelectField key={f.key} label={`${f.label}${f.required ? '' : ' (optional)'}`} value={mapping[f.key] === undefined ? '' : String(mapping[f.key])}
        options={[{ value: '', label: 'Not in this file' }, ...headers.map((h, i) => ({ value: String(i), label: columnName(i, h) }))]}
        onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value === '') delete n[f.key]; else n[f.key] = Number(e.target.value); return n; })} />)}</div>
      <TextField label="Save this layout as" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
      <p className="text-sm">{rows.length} row{rows.length === 1 ? '' : 's'} read.</p>
      <Button fullWidth={false} disabled={!rows.length || missingRequired(mapping, REMITTANCE_COLUMNS).length > 0 || (mapping.claimNumber === undefined && mapping.enrolleeNumber === undefined)} onClick={() => void match()}>Match to claims</Button>
    </div> : null}
    {review ? <div className="space-y-3">
      <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-outline-soft"><th className="p-2">Accept</th><th className="p-2">Row</th><th className="p-2">Claim</th><th className="p-2">Paid</th><th className="p-2">Approved</th><th className="p-2">Match</th></tr></thead>
        <tbody>{review.map((r, i) => <tr key={r.sourceRow} data-row={r.sourceRow} data-confidence={r.confidence} className="border-b border-outline-soft align-top">
          <td className="p-2"><input type="checkbox" aria-label={`Accept row ${r.sourceRow}`} checked={r.accept} disabled={!r.claimId || !r.paidMinor} onChange={(e) => setReview((all) => all!.map((x, n) => n === i ? { ...x, accept: e.target.checked } : x))} /></td>
          <td className="p-2">{r.sourceRow}</td>
          <td className="p-2">{r.candidates.length > 1 || (r.confidence !== 'exact' && r.candidates.length) ? <SelectField label={`Claim for row ${r.sourceRow}`} value={r.claimId ?? ''} options={[{ value: '', label: 'Choose…' }, ...r.candidates.map((c) => ({ value: c.claimId, label: `${c.claimNumber} · ${c.patientName}` }))]}
            onChange={(e) => setReview((all) => all!.map((x, n) => n === i ? { ...x, claimId: e.target.value || undefined, accept: false } : x))} /> : r.candidates[0] ? `${r.candidates[0].claimNumber} · ${r.candidates[0].patientName}` : 'No claim found'}</td>
          <td className="p-2">{r.paidMinor === undefined ? '—' : formatMoney(r.paidMinor, 'NGN')}</td><td className="p-2">{r.approvedMinor === undefined ? '—' : formatMoney(r.approvedMinor, 'NGN')}</td>
          <td className={`p-2 ${r.confidence === 'exact' ? 'text-success' : r.confidence === 'none' ? 'text-danger' : 'text-amber-text'}`}>{r.confidence === 'exact' ? 'Claim number matches' : r.confidence === 'uncertain' ? 'Check this match' : 'No match'}{r.problems.length ? <span className="block text-xs">{r.problems.join('; ')}</span> : null}</td>
        </tr>)}</tbody></table></div>
      <div className="grid gap-2 sm:grid-cols-4">
        <TextField label="Payment or advice reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        <TextField label="Received on" type="date" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
        <TextField label="Amount actually received" inputMode="decimal" value={amount} onChange={(e) => setAmount(typed(e.target.value))} />
        <SelectField label="Received by" value={method} options={RemittanceMethod.options.map((m) => ({ value: m, label: METHOD_LABELS[m] }))} onChange={(e) => setMethod(e.target.value as typeof method)} />
      </div>
      <label className="flex min-h-[40px] items-center gap-2 text-sm"><input type="checkbox" checked={decisions} onChange={(e) => setDecisions(e.target.checked)} />Also record the payer's approved amounts as its decisions (for claims without one)</label>
      <p className="text-sm">{accepted.length} row{accepted.length === 1 ? '' : 's'} accepted · {formatMoney(allocated, 'NGN')} allocated of {formatMoney(total, 'NGN')}</p>
      {allocated > total ? <p className="text-sm text-danger">More is allocated than was received.</p> : null}
      <div className="flex gap-2"><Button fullWidth={false} loading={busy} disabled={!reference.trim() || !total || allocated > total || !accepted.length} onClick={() => void record()}>Record payment</Button>
        <Button variant="ghost" fullWidth={false} onClick={() => setReview(undefined)}>Back to columns</Button></div>
    </div> : null}
  </section>;
};
