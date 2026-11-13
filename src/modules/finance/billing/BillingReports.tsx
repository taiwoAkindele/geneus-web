import { FeeCategory } from '@shared';
import { formatMoney } from '@/lib/money';
import { collectionAllocations } from './ledger';
import type { BillingData } from './useBilling';
import { CATEGORY_LABELS } from './feeForm';
import { calendarDate } from '@/lib/calendarDate';

export const BillingReports = ({ data, currency, from, to, departmentId, search }: { data: BillingData; currency: string; from: string; to: string; departmentId: string; search: string }) => {
  const allocations = collectionAllocations(data, { currency, from, to, departmentId, search });
  const payments = [...new Map(allocations.map((allocation) => [allocation.payment.id, allocation.payment])).values()];
  const money = (n: number) => formatMoney(n, currency);
  const received = (filter: (category: string, actor: string, method: string) => boolean) => allocations.reduce((total, allocation) => total + (filter(allocation.charge.category, allocation.payment.createdBy, allocation.payment.method) ? allocation.amountMinor : 0), 0);
  const tableClass = 'w-full text-left text-sm';
  // Refunds are money handed back, dated by when they were made; they never change the payments they refund.
  const refunds = (data.insurance?.refunds ?? []).filter((r) => r.currency === currency && (!from || calendarDate(r.createdOn) >= from) && (!to || calendarDate(r.createdOn) <= to));
  const refundedBy = (id?: string) => refunds.filter((r) => !id || r.createdBy === id).reduce((n, r) => n + r.amountMinor, 0);
  return <div className="space-y-4">
    <p className="text-sm">Collections use payment dates. Waivers and exemptions are reductions, not cash received. Select Patient charges for patient-level discounts, waivers and debts.</p>
    {!allocations.length ? <p role="status" className="rounded-field border border-outline-soft bg-white p-4 text-sm">No collections match these filters.</p> : null}
    {refunds.length ? <div className="rounded-card border border-outline-soft bg-white p-4"><p>Refunds handed back</p><strong>{money(refundedBy())}</strong><ul className="mt-2 space-y-1 text-xs text-ink-muted">{refunds.map((r) => <li key={r.id}>{r.refundNumber} · {data.patients.find((p) => p.patientId === r.patientId)?.fullName ?? r.patientId} · {money(r.amountMinor)} · {r.method} · {data.staff.find((st) => st.staffId === r.createdBy)?.fullName ?? r.createdBy}</li>)}</ul></div> : null}
    <div className="grid grid-cols-2 gap-3">{['cash', 'transfer'].map((m) => <div className="rounded-card border border-outline-soft bg-white p-4" key={m}><p>{m === 'cash' ? 'Cash collected' : 'Transfers allocated to bills'}</p><strong>{money(received((_c, _a, method) => method === m))}</strong></div>)}</div>
    <div className="overflow-auto rounded-card border border-outline-soft bg-white"><table className={tableClass}><caption className="p-3 text-left font-bold">Collections by fee category</caption><thead><tr><th className="p-3">Category</th><th className="p-3">Collected</th></tr></thead><tbody>{FeeCategory.options.map((c) => <tr key={c}><td className="p-3">{CATEGORY_LABELS[c]}</td><td className="p-3">{money(received((category) => category === c))}</td></tr>)}</tbody></table></div>
    <div className="overflow-auto rounded-card border border-outline-soft bg-white"><table className={tableClass}><caption className="p-3 text-left font-bold">Staff handover</caption><thead><tr><th className="p-3">Staff</th><th className="p-3">Cash</th><th className="p-3">Transfers matched</th>{refunds.length ? <th className="p-3">Refunds</th> : null}</tr></thead><tbody>{[...new Set([...payments.map((p) => p.createdBy), ...refunds.map((r) => r.createdBy)])].map((id) => <tr key={id}><td className="p-3">{data.staff.find((s) => s.staffId === id)?.fullName ?? id}</td>{['cash', 'transfer'].map((m) => <td key={m} className="p-3">{money(received((_c, actor, method) => actor === id && method === m))}</td>)}{refunds.length ? <td className="p-3">{money(refundedBy(id))}</td> : null}</tr>)}</tbody></table></div>
  </div>;
};
