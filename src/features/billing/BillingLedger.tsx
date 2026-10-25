import { useState } from 'react';
import { Button, DataTable } from '@/ui';
import { formatMoney } from '@/lib/money';
import { calendarDate } from '@/lib/calendarDate';
import type { BillingData } from './useBilling';
import type { billingRows } from './ledger';

export const BillingLedger = ({ rows, data, onPatient }: { rows: ReturnType<typeof billingRows>; data: BillingData; onPatient: (id: string) => void }) => {
  const [page, setPage] = useState(0);
  const current = Math.min(page, Math.max(0, Math.ceil(rows.length / 40) - 1));
  const visible = rows.slice(current * 40, current * 40 + 40);
  const name = (id: string) => data.patients.find((p) => p.patientId === id)?.fullName ?? id;
  const money = (row: typeof rows[number], n: number) => formatMoney(n, row.charge.currency);
  const detail = (r: typeof rows[number]) => <div>{r.charge.description}<p className="mt-1 text-xs text-ink-muted">{r.charge.exemptionReason ? `Exempt: ${r.charge.exemptionReason}` : ''}{r.reasons.join(' · ')}</p></div>;
  return <>
    <div className="hidden lg:block"><DataTable caption="Patient fee ledger" rows={visible} rowKey={(r) => r.charge.id} columns={[
      { key: 'patient', label: 'Patient', render: (r) => <button type="button" className="text-left font-bold text-brand" onClick={() => onPatient(r.charge.patientId)}>{name(r.charge.patientId)}<span className="block font-mono text-xs font-normal">{r.charge.patientId}</span></button> },
      { key: 'date', label: 'Date', render: (r) => calendarDate(r.charge.createdOn) },
      { key: 'fee', label: 'Fee / reason', render: detail },
      { key: 'original', label: 'Original', render: (r) => money(r, r.charge.listPriceMinor) },
      { key: 'discount', label: 'Discount', render: (r) => money(r, r.discountMinor) },
      { key: 'waiver', label: 'Waived', render: (r) => money(r, r.waivedMinor) },
      { key: 'due', label: 'Due', render: (r) => money(r, r.dueMinor) },
      { key: 'paid', label: 'Paid', render: (r) => money(r, r.settledMinor) },
      { key: 'balance', label: 'Balance', render: (r) => money(r, r.balanceMinor) },
      { key: 'status', label: 'Status', render: (r) => r.status },
    ]} /></div>
    <div className="space-y-3 lg:hidden">{visible.map((r) => <button key={r.charge.id} type="button" onClick={() => onPatient(r.charge.patientId)} className="block w-full rounded-card border border-outline-soft bg-white p-4 text-left">
      <div className="flex justify-between gap-3"><strong>{name(r.charge.patientId)}</strong><span className="text-xs">{r.status}</span></div>
      <p className="mt-1 font-mono text-xs text-ink-muted">{r.charge.patientId} · {calendarDate(r.charge.createdOn)}</p>
      <div className="mt-2 text-sm">{detail(r)}</div>
      <dl className="mt-2 grid grid-cols-2 gap-1 text-sm">{[['Original', r.charge.listPriceMinor], ['Due', r.dueMinor], ['Discount', r.discountMinor], ['Waived', r.waivedMinor], ['Paid', r.settledMinor], ['Balance', r.balanceMinor]].map(([label, value]) => <div key={label}><dt className="inline">{label} </dt><dd className="inline font-semibold">{money(r, Number(value))}</dd></div>)}</dl>
    </button>)}</div>
    {!rows.length ? <p className="rounded-card border border-dashed border-outline p-5">No bills match these filters. Fees appear when raised for a patient, including exempt and waived fees.</p> : null}
    <div className="flex items-center gap-3"><Button fullWidth={false} variant="ghost" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button><span className="text-sm">{Math.min(current * 40 + 1, rows.length)}–{Math.min(current * 40 + 40, rows.length)} of {rows.length}</span><Button fullWidth={false} variant="ghost" disabled={(current + 1) * 40 >= rows.length} onClick={() => setPage(current + 1)}>Next</Button></div>
  </>;
};
