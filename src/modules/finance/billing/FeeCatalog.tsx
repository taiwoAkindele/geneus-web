import { useRef, useState } from 'react';
import type { FeeItem } from '@shared';
import { useAuthorizationContext } from '@/session';
import { setFeeItemActive } from '@/data/repos/billing';
import { Button, DataTable, SelectField, Tag, TextField, useToast } from '@/ui';
import { formatMoney } from '@/lib/money';
import { CATEGORY_LABELS, CHARGE_WHEN_LABELS } from './feeForm';

export const FeeCatalog = ({ fees, onEdit, onChanged }: { fees: readonly FeeItem[]; onEdit: (fee: FeeItem) => void; onChanged: () => void }) => {
  const context = useAuthorizationContext(), toast = useToast();
  const [search, setSearch] = useState(''), [status, setStatus] = useState('active'), [busyId, setBusyId] = useState<string>();
  const lock = useRef(false), canManage = context.permissions.includes('fee_item:manage');
  const rows = [...fees].filter((fee) => `${fee.name} ${CATEGORY_LABELS[fee.category]}`.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || fee.active === (status === 'active'))).sort((a, b) => a.name.localeCompare(b.name));
  const toggle = async (fee: FeeItem) => {
    if (lock.current) return;
    lock.current = true; setBusyId(fee.id);
    try { await setFeeItemActive(fee.id, !fee.active, context); toast(fee.active ? 'Fee retired. Existing patient bills keep their prices.' : 'Fee restored.'); onChanged(); }
    catch (cause) { toast(cause instanceof Error ? cause.message : 'Could not change this fee.', { tone: 'error' }); }
    finally { lock.current = false; setBusyId(undefined); }
  };
  const actions = (fee: FeeItem) => canManage ? <div className="flex flex-wrap gap-2"><Button variant="ghost" fullWidth={false} className="px-3 py-2 text-sm" disabled={Boolean(busyId)} onClick={() => onEdit(fee)}>Edit</Button><Button variant="ghost" fullWidth={false} className="px-3 py-2 text-sm" disabled={Boolean(busyId)} loading={busyId === fee.id} onClick={() => void toggle(fee)}>{fee.active ? 'Retire' : 'Restore'}</Button></div> : <span className="text-xs text-ink-muted">View only</span>;
  return <section className="space-y-4" aria-label="Facility fees"><div><h2 className="text-lg font-extrabold">Fees</h2><p className="mt-1 text-sm text-ink-soft">The prices this facility charges for services. Add or edit a fee here; existing patient bills retain their recorded prices.</p></div>
    <div className="grid max-w-2xl gap-3 sm:grid-cols-[2fr_1fr]"><TextField label="Find fee by name or category" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /><SelectField label="Show fees" value={status} onChange={(event) => setStatus(event.target.value)} options={[{ value: 'active', label: 'Active fees' }, { value: 'retired', label: 'Retired fees' }, { value: 'all', label: 'All fees' }]} /></div>
    {!rows.length ? <div className="rounded-card border border-dashed border-outline p-5 text-sm text-ink-soft">{fees.length ? 'No fees match these filters. Change the search or show all fees.' : 'No fees yet. Add a fee when this facility needs to charge for a service. Facilities providing free care can leave this empty.'}</div> : <><div className="hidden lg:block"><DataTable caption="Facility fees" rows={rows} rowKey={(fee) => fee.id} columns={[
      { key: 'name', label: 'Fee', sortValue: (fee) => fee.name, render: (fee) => canManage ? <button type="button" className="min-h-[44px] text-left font-bold text-brand" onClick={() => onEdit(fee)}>{fee.name}</button> : <strong>{fee.name}</strong> },
      { key: 'category', label: 'Category', render: (fee) => CATEGORY_LABELS[fee.category] },
      { key: 'amount', label: 'Price', align: 'right', render: (fee) => formatMoney(fee.amountMinor, fee.currency) },
      { key: 'when', label: 'Charged', render: (fee) => CHARGE_WHEN_LABELS[fee.chargeWhen] },
      { key: 'exemptions', label: 'Free-care rules', render: (fee) => fee.exemptions.map((rule) => rule.reason).join(' · ') || 'None' },
      { key: 'active', label: 'Status', render: (fee) => fee.active ? 'Active' : 'Retired' },
      { key: 'actions', label: 'Actions', render: actions },
    ]} /></div><div className="space-y-3 lg:hidden">{rows.map((fee) => <article key={fee.id} className="rounded-card border border-outline-soft bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="min-w-0 font-bold">{fee.name}</h3><strong className="font-mono text-brand">{formatMoney(fee.amountMinor, fee.currency)}</strong></div><p className="mt-1 text-xs text-ink-muted">{CATEGORY_LABELS[fee.category]} · {CHARGE_WHEN_LABELS[fee.chargeWhen]}</p>{!fee.active ? <Tag tone="neutral">Retired</Tag> : null}{fee.exemptions.length ? <p className="mt-2 text-sm text-brand">Free when eligible: {fee.exemptions.map((rule) => rule.reason).join(' · ')}</p> : null}<div className="mt-3 border-t border-outline-soft pt-2">{actions(fee)}</div></article>)}</div></>}
  </section>;
};
