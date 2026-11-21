import { useState } from 'react';
import type { IncomingTransfer, Payment } from '@shared';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, Sheet, TextField, useToast } from '@/ui';
import { billingRequest } from '@/lib/api/billing';
import { userMessage } from '@/lib/api/userMessage';
import { calendarDate } from '@/lib/calendarDate';
import { StaffVerification } from '@/modules/insurance/StaffVerification';
import { historyDocuments, unlinkedTransfers, type BillDocument, type HistoryDocument } from './billDocuments';
import { useReceiptCapacity } from './ReceiptCapacity';
import type { BillingData } from './useBilling';
import { FilterChip, PageHeader, displayMoney, whenText } from './billingUi';

type Kind = 'all' | 'cash' | 'bank' | 'refund';

/**
 * Payment history: every completed payment with its receipt. Bank transfers not yet
 * applied to a bill are not completed payments; they wait in the strip above the list.
 */
export const PaymentHistory = ({ data, bills, onOpenBill, onReceipt, onLink, onChanged }: {
  data: BillingData; bills: readonly BillDocument[]; onOpenBill: (id: string) => void; onReceipt: (p: Payment) => void; onLink: (t: IncomingTransfer) => void; onChanged: () => void;
}) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const canReceive = context.permissions.includes('payment:receive');
  const [kind, setKind] = useState<Kind>('all');
  const [search, setSearch] = useState('');
  const [more, setMore] = useState(false);
  const [from, setFrom] = useState(''), [to, setTo] = useState(''), [currencyChoice, setCurrency] = useState('');
  const [details, setDetails] = useState<string>();
  const [checking, setChecking] = useState(false), [reference, setReference] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [showAll, setShowAll] = useState(false);

  const name = (id: string) => data.patients.find((p) => p.patientId === id)?.fullName ?? id;
  const staff = (id: string) => data.staff.find((s) => s.staffId === id)?.fullName ?? id;
  const all = historyDocuments(data.payments, data.coverage.refunds);
  const currencies = [...new Set([...all.map((p) => p.currency), ...data.transfers.map((t) => t.currency)])].sort();
  const currency = currencies.includes(currencyChoice) ? currencyChoice : currencies[0] ?? 'NGN';
  const term = search.trim().toLowerCase();
  const billFor = (row: HistoryDocument) => bills.find((b) => b.rows.some((r) => row.chargeIds.includes(r.charge.id)));
  const scoped = all.filter((p) => p.currency === currency && (!from || calendarDate(p.at) >= from) && (!to || calendarDate(p.at) <= to)
    && (!term || `${p.reference} ${name(p.patientId)} ${p.patientId} ${billFor(p)?.reference ?? ''}`.toLowerCase().includes(term)));
  const count = (k: Kind) => scoped.filter((p) => k === 'all' || p.kind === k).length;
  const visible = scoped.filter((p) => kind === 'all' || p.kind === kind);

  const waiting = unlinkedTransfers(data.transfers, data.payments).filter((t) => t.transfer.currency === currency);
  const capacity = useReceiptCapacity(waiting.map((t) => t.transfer.id), data.payments.length);
  const toLink = waiting.map((t) => ({ ...t, left: capacity.sources[t.transfer.id]?.availableMinor ?? t.transfer.amountMinor - t.applied, checked: Boolean(capacity.sources[t.transfer.id]), over: capacity.sources[t.transfer.id]?.overRecognizedMinor ?? 0 }))
    .filter((t) => t.left > 0 || t.over > 0);

  const check = async () => {
    if (busy) return; setBusy(true); setError('');
    try { await billingRequest(context, 'transfers/import', { reference: reference.trim() }); setReference(''); setChecking(false); toast('Transfer confirmed. Link it to a bill from the list above.'); onChanged(); }
    catch (e) { const message = userMessage(e, 'That transfer could not be confirmed. Check the reference and try again.'); setError(message); toast(message, { tone: 'error' }); }
    finally { setBusy(false); }
  };
  const action = (p: HistoryDocument) => p.payment ? <Button variant="ghost" fullWidth={false} className="!px-2 !py-1 text-sm" onClick={() => onReceipt(p.payment!)}>Receipt</Button>
    : <Button variant="ghost" fullWidth={false} className="!px-2 !py-1 text-sm" aria-expanded={details === p.id} onClick={() => setDetails((d) => d === p.id ? undefined : p.id)}>Details</Button>;
  const billLink = (p: HistoryDocument) => { const b = billFor(p); return b ? <button type="button" className="font-mono text-xs text-brand hover:underline" onClick={() => onOpenBill(b.id)}>{b.reference}</button> : <span className="text-xs text-ink-muted">—</span>; };
  const refundDetails = (p: HistoryDocument) => p.refund ? <p className="text-xs text-ink-muted">{p.refund.reason} · {p.refund.method}{p.refund.reference ? ` · ref ${p.refund.reference}` : ''} · by {staff(p.refund.createdBy)}. Money handed back to the patient.</p> : null;

  return <div className="space-y-4">
    <PageHeader title="Payment history">{canReceive ? <Button variant="ghost" fullWidth={false} onClick={() => setChecking(true)}>Check a transfer reference</Button> : null}</PageHeader>

    {canReceive && toLink.length ? <section aria-label="Bank transfers not linked to a bill" className="rounded-card border border-amber-border bg-amber-bg p-4 text-amber-text">
      <h2 className="font-bold">{toLink.length === 1 ? '1 bank transfer isn\'t linked to a bill yet' : `${toLink.length} bank transfers aren't linked to a bill yet`}</h2>
      <ul className="mt-2 divide-y divide-amber-border">{(showAll ? toLink : toLink.slice(0, 3)).map((t) => <li key={t.transfer.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
        <span className="min-w-0 flex-1"><strong>{t.transfer.payerName ?? 'Bank transfer'}</strong> · {displayMoney(t.transfer.amountMinor, t.transfer.currency)} · {whenText(t.transfer.receivedOn)}<span className="block text-xs">{displayMoney(t.left, t.transfer.currency)} not yet applied{t.checked ? '' : ' (checked when you link it)'}{t.over ? ` · ${displayMoney(t.over, t.transfer.currency)} over-applied, needs reconciliation` : ''}</span></span>
        {t.left > 0 ? <Button variant="outlined" fullWidth={false} onClick={() => onLink(t.transfer)}>Link to bill</Button> : null}
      </li>)}</ul>
      {toLink.length > 3 ? <Button variant="ghost" fullWidth={false} className="!px-0 !py-2" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show fewer' : `Show all ${toLink.length}`}</Button> : null}
      {capacity.error ? <p role="alert" className="text-xs">{capacity.error}</p> : null}
    </section> : null}

    <div className="space-y-3">
      <div className="max-w-xl"><TextField label="Find a payment" type="search" placeholder="Patient, receipt or bill number" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <div className="flex flex-wrap items-center gap-2">
        {([['all', 'All'], ['cash', 'Cash'], ['bank', 'Bank'], ['refund', 'Refunds']] as const).map(([k, label]) => <FilterChip key={k} selected={kind === k} count={count(k)} onClick={() => setKind(k)}>{label}</FilterChip>)}
        <span className="flex-1" /><FilterChip selected={more || Boolean(from || to)} onClick={() => setMore((v) => !v)}>More filters</FilterChip>
      </div>
      {more ? <div className="grid gap-3 sm:grid-cols-3"><TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />{currencies.length > 1 ? <SelectField label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} options={currencies.map((c) => ({ value: c, label: c }))} /> : null}</div> : null}
    </div>

    <div className="hidden overflow-x-auto rounded-card border border-outline-soft bg-white lg:block">
      <table className="w-full text-left text-sm tabular-nums">
        <thead><tr className="text-xs uppercase tracking-wide text-ink-muted">{['When', 'Patient', 'Method', 'Amount', 'Bill', ''].map((h, i) => <th key={i} className={`px-4 py-3 font-bold ${i === 3 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody>{visible.flatMap((p) => [<tr key={p.id} className="border-t border-outline-soft align-top">
          <td className="whitespace-nowrap px-4 py-3">{whenText(p.at)}</td>
          <td className="px-4 py-3"><strong>{name(p.patientId)}</strong><p className="text-xs text-ink-muted">{p.patientId}</p></td>
          <td className="px-4 py-3">{p.method}<p className="font-mono text-xs text-ink-muted">{p.reference}</p></td>
          <td className={`whitespace-nowrap px-4 py-3 text-right font-semibold ${p.amount < 0 ? 'text-danger' : ''}`}>{displayMoney(p.amount, p.currency)}</td>
          <td className="px-4 py-3">{billLink(p)}</td>
          <td className="px-4 py-2 text-right">{action(p)}</td>
        </tr>, ...(details === p.id ? [<tr key={`${p.id}:details`}><td colSpan={6} className="px-4 pb-3">{refundDetails(p)}</td></tr>] : [])])}
        {!visible.length ? <tr><td colSpan={6} className="p-8 text-center text-ink-muted">No payments match.</td></tr> : null}</tbody>
      </table>
    </div>
    <div className="space-y-2 lg:hidden">
      {visible.map((p) => <article key={p.id} className="space-y-1 rounded-card border border-outline-soft bg-white p-4">
        <div className="flex items-baseline justify-between gap-2"><strong>{name(p.patientId)}</strong><span className={`font-extrabold tabular-nums ${p.amount < 0 ? 'text-danger' : ''}`}>{displayMoney(p.amount, p.currency)}</span></div>
        <div className="flex items-center justify-between gap-2 text-xs text-ink-muted"><span>{whenText(p.at)} · {p.method}</span>{billLink(p)}</div>
        <div className="flex justify-end">{action(p)}</div>
        {details === p.id ? refundDetails(p) : null}
      </article>)}
      {!visible.length ? <p className="rounded-card border border-dashed border-outline p-4 text-sm text-ink-muted">No payments match.</p> : null}
    </div>

    {checking ? <Sheet title="Check a transfer reference" onClose={() => setChecking(false)} closeDisabled={busy}>
      <p className="mb-3 text-sm text-ink-soft">If a patient's transfer hasn't appeared, enter its Paystack reference. Geneus asks Paystack to confirm it; a typed reference alone is not proof of payment.</p>
      <TextField label="Paystack reference" value={reference} onChange={(e) => setReference(e.target.value)} />
      <div className="mt-4"><StaffVerification requireServerSession purpose="Checking a bank transfer"><Button loading={busy} disabled={!reference.trim()} onClick={() => void check()}>Check transfer</Button></StaffVerification></div>
      {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
    </Sheet> : null}
  </div>;
};
