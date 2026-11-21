import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FeeCategory } from '@shared';
import { SelectField, TextField } from '@/ui';
import { calendarDate } from '@/lib/calendarDate';
import { collectionAllocations } from './ledger';
import type { BillingData } from './useBilling';
import { CATEGORY_LABELS } from './feeForm';
import { FinancialSnapshotReport } from './FinancialSnapshotReport';
import { FilterChip, PageHeader, displayMoney } from './billingUi';

type Period = 'today' | 'week' | 'month' | 'all' | 'custom';
const range = (period: Period, now = new Date()): [string, string] => {
  const today = calendarDate(now);
  if (period === 'today') return [today, today];
  if (period === 'week') { const start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7)); return [calendarDate(start), today]; }
  if (period === 'month') return [calendarDate(new Date(now.getFullYear(), now.getMonth(), 1)), today];
  return ['', ''];
};

/** Collections for a period, counted by payment date; the existing calculations, starting with what a cashier hands over. */
export const ReportsView = ({ data }: { data: BillingData }) => {
  const [period, setPeriod] = useState<Period>('today');
  const [customFrom, setFrom] = useState(''), [customTo, setTo] = useState(''), [currencyChoice, setCurrency] = useState('');
  const [from, to] = period === 'custom' ? [customFrom, customTo] : range(period);
  const currencies = [...new Set([...data.payments.map((p) => p.currency), ...data.charges.map((c) => c.currency)])].sort();
  const currency = currencies.includes(currencyChoice) ? currencyChoice : currencies[0] ?? 'NGN';
  const money = (n: number) => displayMoney(n, currency);
  const allocations = collectionAllocations(data, { currency, from, to, departmentId: '', search: '' });
  const received = (test: (category: string, actor: string, method: string) => boolean) => allocations.reduce((n, a) => n + (test(a.charge.category, a.payment.createdBy, a.payment.method) ? a.amountMinor : 0), 0);
  const refunds = (data.insurance?.refunds ?? []).filter((r) => r.currency === currency && (!from || calendarDate(r.createdOn) >= from) && (!to || calendarDate(r.createdOn) <= to));
  const refunded = (id?: string) => refunds.filter((r) => !id || r.createdBy === id).reduce((n, r) => n + r.amountMinor, 0);
  const cash = received((_c, _a, m) => m === 'cash'), bank = received((_c, _a, m) => m === 'transfer');
  const paymentCount = new Set(allocations.map((a) => a.payment.id)).size;
  const byCategory = FeeCategory.options.map((c) => ({ c, amount: received((category) => category === c) })).filter((x) => x.amount).sort((a, b) => b.amount - a.amount);
  const top = Math.max(1, ...byCategory.map((x) => x.amount));
  const people = [...new Set([...allocations.map((a) => a.payment.createdBy), ...refunds.map((r) => r.createdBy)])];
  const staff = (id: string) => data.staff.find((s) => s.staffId === id)?.fullName ?? id;
  const tiles = [
    { label: 'Received', value: cash + bank, note: `${paymentCount} ${paymentCount === 1 ? 'payment' : 'payments'}` },
    { label: 'Cash', value: cash, note: 'to hand over' },
    { label: 'Bank transfers', value: bank, note: 'applied to bills' },
    { label: 'Refunds', value: refunded(), note: 'handed back' },
  ];

  return <div className="space-y-4">
    <PageHeader title="Reports" />
    <div className="flex flex-wrap items-center gap-2">
      {([['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['all', 'All time'], ['custom', 'Custom']] as const).map(([p, label]) => <FilterChip key={p} selected={period === p} onClick={() => setPeriod(p)}>{label}</FilterChip>)}
      {currencies.length > 1 ? <div className="ml-auto w-40"><SelectField label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)} options={currencies.map((c) => ({ value: c, label: c }))} /></div> : null}
    </div>
    {period === 'custom' ? <div className="grid max-w-xl gap-3 sm:grid-cols-2"><TextField label="From" type="date" value={customFrom} onChange={(e) => setFrom(e.target.value)} /><TextField label="To" type="date" value={customTo} onChange={(e) => setTo(e.target.value)} /></div> : null}
    <p className="text-xs text-ink-muted">Counted by the date money was received or handed back. Discounts, waivers and exemptions are not money received.</p>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{tiles.map((t) => <div key={t.label} className="rounded-card border border-outline-soft bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{t.label}</p><p className="mt-1 text-2xl font-extrabold tabular-nums">{money(t.value)}</p><p className="text-xs text-ink-muted">{t.note}</p></div>)}</div>
    <div className="grid gap-3 lg:grid-cols-[1.3fr_1fr]">
      <section className="space-y-3 rounded-card border border-outline-soft bg-white p-4"><h2 className="font-bold">By category</h2>
        {byCategory.length ? byCategory.map(({ c, amount }) => <div key={c} className="space-y-1"><div className="flex justify-between text-sm"><span>{CATEGORY_LABELS[c]}</span><strong className="tabular-nums">{money(amount)}</strong></div><div className="h-2 overflow-hidden rounded bg-surface-muted"><div className="h-full rounded bg-brand" style={{ width: `${Math.round(amount / top * 100)}%` }} /></div></div>)
          : <p className="text-sm text-ink-muted">Nothing received in this period.</p>}
      </section>
      <section className="rounded-card border border-outline-soft bg-white p-4"><h2 className="font-bold">By staff</h2>
        {people.length ? <table className="mt-2 w-full text-left text-sm tabular-nums"><thead><tr className="text-xs uppercase tracking-wide text-ink-muted"><th className="py-2 font-bold">Staff</th><th className="py-2 text-right font-bold">Cash</th><th className="py-2 text-right font-bold">Bank</th>{refunds.length ? <th className="py-2 text-right font-bold">Refunds</th> : null}</tr></thead>
          <tbody>{people.map((id) => <tr key={id} className="border-t border-outline-soft"><td className="py-2">{staff(id)}</td><td className="py-2 text-right">{money(received((_c, a, m) => a === id && m === 'cash'))}</td><td className="py-2 text-right">{money(received((_c, a, m) => a === id && m === 'transfer'))}</td>{refunds.length ? <td className="py-2 text-right">{money(refunded(id))}</td> : null}</tr>)}</tbody></table>
          : <p className="mt-2 text-sm text-ink-muted">No one has received money in this period.</p>}
      </section>
    </div>
    <details className="rounded-card border border-outline-soft bg-white p-4"><summary className="min-h-[44px] cursor-pointer py-2 font-bold">More reports</summary>
      <div className="mt-3 space-y-4"><FinancialSnapshotReport key={currency} currency={currency} /><Link className="inline-flex min-h-[44px] items-center font-bold text-brand" to="/billing?tab=departments">Department history</Link></div>
    </details>
  </div>;
};
