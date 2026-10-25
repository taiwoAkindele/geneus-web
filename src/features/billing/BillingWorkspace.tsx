import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FeeCategory, type IncomingTransfer, type Payment } from '@shared';
import { AppBar, Button, SelectField, Sheet, TextField } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { useAuthorizationContext, useSession } from '@/session';
import { formatMoney } from '@/lib/money';
import { calendarDate } from '@/lib/calendarDate';
import { billingRequest } from '@/lib/api/billing';
import { CATEGORY_LABELS } from './feeForm';
import { useBilling } from './useBilling';
import { billingRows, totalsFor, transferAllocated } from './ledger';
import { PatientAccount } from './PatientAccount';
import { Receipt } from './Receipt';
import { BillingLedger } from './BillingLedger';
import { BillingReports } from './BillingReports';

export const BillingWorkspace = () => {
  const navigate = useNavigate(); const context = useAuthorizationContext(); const { user } = useSession();
  const query = useBilling(); const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [status, setStatus] = useState('all'); const [currencyChoice, setCurrency] = useState(''); const [departmentId, setDepartment] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [patientId, setPatientId] = useState(params.get('patient') ?? ''); const [transfer, setTransfer] = useState<IncomingTransfer>();
  const [receipt, setReceipt] = useState<Payment>(); const [choosePatient, setChoosePatient] = useState(false); const [patientSearch, setPatientSearch] = useState('');
  const [reference, setReference] = useState(''); const [importing, setImporting] = useState(false); const [importError, setImportError] = useState('');
  const allowed = user.roles.some((r) => ['cashier', 'facility_admin', 'supervisor'].includes(r)) || context.permissions.some((p) => ['fee_item:manage', 'payment:receive', 'payment:waive'].includes(p));
  if (!allowed) return <p className="p-5">Billing access has not been assigned to your account.</p>;
  const data = query.data; const tab = params.get('tab') ?? 'departments'; const category = params.get('category') ?? '';
  const go = (nextTab: string, nextCategory = '') => setParams({ tab: nextTab, ...(nextCategory ? { category: nextCategory } : {}) });
  const currencies = [...new Set([...(data?.fees.map((f) => f.currency) ?? []), ...(data?.charges.map((c) => c.currency) ?? []), ...(data?.transfers.map((t) => t.currency) ?? [])])].sort();
  const currency = currencies.includes(currencyChoice) ? currencyChoice : currencies[0] ?? 'NGN';
  const name = (id: string) => data?.patients.find((p) => p.patientId === id)?.fullName ?? id;
  const department = (id?: string) => data?.departments.find((d) => d.id === id)?.name ?? 'Hospital / general';
  const departmentMatches = (id?: string) => !departmentId || (departmentId === '__general__' ? !id : id === departmentId);
  const dateMatches = (at: string) => (!from || calendarDate(at) >= from) && (!to || calendarDate(at) <= to);
  const allRows = data ? billingRows(data.charges, data.payments, data.adjustments) : [];
  const rows = allRows.filter((r) => r.charge.currency === currency && departmentMatches(r.charge.departmentId) && (!category || r.charge.category === category) && dateMatches(r.charge.createdOn)
    && `${name(r.charge.patientId)} ${r.charge.patientId} ${r.charge.description}`.toLowerCase().includes(search.toLowerCase())
    && (status === 'all' || (status === 'unpaid' && r.balanceMinor > 0) || (status === 'settled' && r.balanceMinor <= 0) || (status === 'discounted' && r.discountMinor > 0)
      || (status === 'waived' && (r.waivedMinor > 0 || r.receipts.some((p) => p.method === 'waiver'))) || (status === 'exempt' && Boolean(r.charge.exemptionReason))));
  const totals = totalsFor(rows); const money = (n: number) => formatMoney(n, currency);
  const transfers = data?.transfers.filter((t) => t.currency === currency && departmentMatches(t.departmentId) && dateMatches(t.receivedOn) && `${t.providerReference} ${t.payerName ?? ''}`.toLowerCase().includes(search.toLowerCase())) ?? [];
  const openPatient = (id: string) => { setPatientId(id); setChoosePatient(false); };
  const importTransfer = async () => {
    if (importing) return; setImporting(true); setImportError('');
    try { await billingRequest('transfers/import', { actorStaffId: context.userId, reference }); setReference(''); query.reload(); }
    catch (e) { setImportError(e instanceof Error ? e.message : 'Could not check the transfer'); }
    finally { setImporting(false); }
  };
  return <div className="min-h-screen bg-surface"><AppBar title="Billing" onBack={() => navigate('/home')} right={<SyncPill />} />
    <main className="space-y-4 px-5 pb-24 pt-3 md:px-8">
      <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-extrabold">{category ? CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? 'Fees' : 'Billing'}</h1><Button fullWidth={false} className="px-3 py-2 text-sm" onClick={() => { setTransfer(undefined); setChoosePatient(true); }}>Find patient bill</Button></div>
      {context.permissions.includes('fee_item:manage') ? <div className="flex flex-wrap gap-2"><Button fullWidth={false} variant="outlined" className="px-3 py-2 text-sm" onClick={() => navigate('/billing/fees')}>Manage fees</Button><Button fullWidth={false} variant="ghost" className="px-3 py-2 text-sm" onClick={() => navigate('/billing/settings')}>Departments & accounts</Button></div> : null}
      <nav aria-label="Billing sections" className="flex gap-2 overflow-x-auto pb-1">{[['departments', 'Departments'], ['categories', 'Categories'], ['transfers', 'Transfers'], ['reports', 'Reports']].map(([value, label]) => <Button key={value} fullWidth={false} className="shrink-0 px-3 py-2 text-[13px] lg:text-[15px]" variant={tab === value ? 'primary' : 'outlined'} onClick={() => go(value)}>{label}</Button>)}</nav>
      <p className="text-xs text-ink-muted">Records on this device update when it syncs. Cash works offline; bank transfers appear after provider verification and sync.</p>
      {query.loading ? <div role="status" className="h-40 animate-pulse rounded-card bg-surface-muted" aria-label="Loading billing" /> : query.error || !data ? <div role="alert">Billing records could not be read.<Button variant="ghost" onClick={query.reload}>Try again</Button></div> : <>
        <div className="flex items-center gap-3 lg:hidden"><Button fullWidth={false} variant="outlined" aria-expanded={showFilters} aria-controls="billing-filters" onClick={() => setShowFilters((v) => !v)}>Filters{[search, from, to, departmentId, status !== 'all' ? status : ''].filter(Boolean).length ? ' · active' : ''}</Button><span className="text-xs text-ink-muted">{departmentId ? department(departmentId === '__general__' ? undefined : departmentId) : 'All departments'} · {currency}</span></div>
        <div id="billing-filters" className={`${showFilters ? 'grid' : 'hidden'} gap-3 sm:grid-cols-2 lg:grid lg:grid-cols-6`}><TextField label="Search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Patient, fee or reference" /><TextField label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><TextField label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} /><SelectField label="Currency" value={currency} options={currencies.length ? currencies.map((v) => ({ value: v, label: v })) : [{ value: 'NGN', label: 'NGN' }]} onChange={(e) => setCurrency(e.target.value)} /><SelectField label="Department" value={departmentId} options={[{ value: '', label: 'All departments' }, { value: '__general__', label: 'Hospital / general' }, ...data.departments.map((d) => ({ value: d.id, label: d.name }))]} onChange={(e) => setDepartment(e.target.value)} /><SelectField label="Fee entries" value={status} options={['all', 'unpaid', 'settled', 'discounted', 'waived', 'exempt'].map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }))} onChange={(e) => setStatus(e.target.value)} /></div>
        {from && to && from > to ? <p role="alert" className="text-sm text-danger">The end date must be after the start date.</p> : null}
        {tab === 'departments' ? <>
          <p className="text-sm">Receiving accounts belong to departments. Department receipts include transfers that have not yet been matched to a patient bill.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[{ id: '', name: 'Hospital / general' }, ...data.departments].map((d) => {
            const bills = allRows.filter((r) => (r.charge.departmentId ?? '') === d.id && r.charge.currency === currency && dateMatches(r.charge.createdOn));
            const incoming = data.transfers.filter((t) => t.mode === 'live' && (t.departmentId ?? '') === d.id && t.currency === currency && dateMatches(t.receivedOn));
            const received = incoming.reduce((n, t) => n + t.amountMinor, 0); const unallocated = incoming.reduce((n, t) => n + t.amountMinor - transferAllocated(t.id, data.payments), 0);
            return <button key={d.id} type="button" onClick={() => { setDepartment(d.id || '__general__'); go('categories'); }} className="rounded-card border border-outline-soft bg-white p-4 text-left"><h2 className="font-bold">{d.name}</h2><p className="mt-2 text-sm">Bank transfers received {money(received)}</p><p className="mt-1 text-sm">Awaiting allocation {money(unallocated)}</p><p className="mt-1 text-xs text-ink-muted">{bills.length} fee entries · Outstanding {money(totalsFor(bills).outstanding)}</p></button>;
          })}</div>
        </> : tab === 'categories' ? <>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">{Object.entries({ 'Original fees': totals.original, Discounts: totals.discounted, Waivers: totals.waived, Exemptions: totals.exempt, Collected: totals.collected, Outstanding: totals.outstanding }).map(([label, value]) => <div className="rounded-card border border-outline-soft bg-white p-3" key={label}><p className="text-xs text-ink-muted">{label}</p><p className="mt-1 font-mono text-lg font-bold">{money(value)}</p></div>)}</div>
          {!category ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{FeeCategory.options.map((c) => { const group = rows.filter((r) => r.charge.category === c); const total = totalsFor(group); return <button key={c} type="button" onClick={() => go('categories', c)} className="rounded-card border border-outline-soft bg-white p-4 text-left"><h2 className="font-bold">{CATEGORY_LABELS[c]}</h2><p className="mt-2 text-sm">{group.length} entries · Collected {money(total.collected)}</p><p className="mt-1 text-xs text-ink-muted">Outstanding {money(total.outstanding)}</p></button>; })}</div> : <Button variant="ghost" fullWidth={false} onClick={() => go('categories')}>All categories</Button>}
          <BillingLedger rows={rows} data={data} onPatient={(id) => { setTransfer(undefined); openPatient(id); }} />
        </> : tab === 'transfers' ? <>
          {context.permissions.includes('payment:receive') ? <div className="flex flex-wrap items-end gap-3 rounded-card border border-outline-soft bg-white p-3"><TextField label="Missing transfer? Check its Paystack reference" value={reference} onChange={(e) => setReference(e.target.value)} /><Button fullWidth={false} loading={importing} disabled={!reference.trim()} onClick={() => void importTransfer()}>Check with Paystack</Button>{importError ? <p role="alert" className="w-full text-sm text-danger">{importError}</p> : null}</div> : null}
          {!transfers.length ? <p className="rounded-card border border-dashed border-outline p-5">No incoming transfers match these filters. An administrator can connect department accounts under Departments &amp; accounts.</p> : transfers.slice(0, 100).map((t) => { const left = t.amountMinor - transferAllocated(t.id, data.payments); return <article key={t.id} className="rounded-card border border-outline-soft bg-white p-4"><div className="flex flex-wrap justify-between gap-3"><div><strong>{money(t.amountMinor)} {t.mode === 'test' ? '(TEST)' : ''} · {department(t.departmentId)}</strong><p className="text-sm">{t.payerName ?? 'Bank transfer'}</p><p className="mt-1 break-all font-mono text-xs text-ink-muted">{t.providerReference}</p><p className="text-xs">{new Date(t.receivedOn).toLocaleString('en-GB')} · Account {t.receivingAccount ?? 'Not supplied'}</p></div><div><p className="text-sm font-bold">{left <= 0 ? 'Matched' : left < t.amountMinor ? 'Partly matched' : 'Unmatched'}</p><p className="text-sm">Unallocated {money(left)}</p>{t.mode === 'test' ? <p className="text-xs text-ink-muted">Test transfer: cannot settle a patient bill.</p> : null}{left > 0 && t.mode === 'live' && context.permissions.includes('payment:receive') ? <Button className="mt-2" fullWidth={false} onClick={() => { setTransfer(t); setChoosePatient(true); }}>Match to patient fees</Button> : null}</div></div></article>; })}
          {transfers.length > 100 ? <p className="text-sm">Showing the first 100 transfers. Narrow the date or reference filters.</p> : null}
        </> : <BillingReports data={data} currency={currency} from={from} to={to} departmentId={departmentId} />}
      </>}
    </main>
    {choosePatient && data ? <Sheet title="Choose patient" eyebrow={transfer ? `Match ${formatMoney(transfer.amountMinor, transfer.currency)} · ${department(transfer.departmentId)}` : 'Patient billing account'} onClose={() => { setChoosePatient(false); setTransfer(undefined); }}><TextField label="Patient name or ID" value={patientSearch} onChange={(e) => setPatientSearch(e.target.value)} /><div className="mt-3 max-h-80 overflow-auto">{data.patients.filter((p) => `${p.fullName} ${p.patientId}`.toLowerCase().includes(patientSearch.toLowerCase())).slice(0, 30).map((p) => <button key={p.patientId} type="button" className="block min-h-[48px] w-full border-b border-outline-soft py-2 text-left" onClick={() => openPatient(p.patientId)}><strong>{p.fullName}</strong><span className="ml-2 font-mono text-xs">{p.patientId}</span></button>)}</div></Sheet> : null}
    {patientId && data && !receipt && !choosePatient ? <PatientAccount key={`${patientId}|${transfer?.id ?? 'cash'}`} patientId={patientId} transfer={transfer} data={data} onSelectAccount={setPatientId} onClose={() => { setPatientId(''); setTransfer(undefined); }} onSaved={query.reload} onReceipt={(p) => { setReceipt(p); setPatientId(''); setTransfer(undefined); query.reload(); }} /> : null}
    {receipt && data ? <Receipt payment={receipt} data={data} onClose={() => setReceipt(undefined)} /> : null}
  </div>;
};
