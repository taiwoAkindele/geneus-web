import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { FeeItem } from '@shared';
import { SyncPill } from '@/app/SyncPill';
import { useLiveQuery } from '@/data';
import { createFeeItem, listFeeItems, setFeeItemActive, updateFeeItem, type FeeDraft } from '@/data/repos/billing';
import { CATEGORY_LABELS, CHARGE_WHEN_LABELS, FeeEditorSheet } from '@/features/billing';
import { formatMoney } from '@/lib/money';
import { useAuthorizationContext } from '@/session';
import { AppBar, Button, DataTable, Tag, useToast } from '@/ui';

export const FeeScheduleScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const context = useAuthorizationContext();
  const fees = useLiveQuery(listFeeItems);
  const [editing, setEditing] = useState<FeeItem | 'new'>();
  const [busyId, setBusyId] = useState<string>();
  const toggling = useRef(false);

  const save = async (draft: FeeDraft) => {
    if (editing && editing !== 'new') await updateFeeItem(editing.id, draft, context);
    else await createFeeItem(draft, context);
    toast(editing === 'new' ? 'Fee added' : 'Fee updated');
    setEditing(undefined);
  };

  const toggle = async (fee: FeeItem) => {
    if (toggling.current) return;
    toggling.current = true;
    setBusyId(fee.id);
    try {
      await setFeeItemActive(fee.id, !fee.active, context);
      toast(fee.active ? 'Fee retired — existing bills stay the same' : 'Fee restored');
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Could not update this fee', { tone: 'error' });
    } finally {
      toggling.current = false;
      setBusyId(undefined);
    }
  };

  if (!context.permissions.includes('fee_item:manage')) {
    return (
      <div className="min-h-screen bg-surface">
        <AppBar title="Fee schedule" onBack={() => navigate('/home')} />
        <p className="px-5 py-6 text-[15px] text-ink-muted">Only a facility admin with write access can manage fees.</p>
      </div>
    );
  }

  const all = [...(fees.data ?? [])].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  return (
    <div className="min-h-screen bg-surface">
      <AppBar title="Fee schedule" onBack={() => navigate('/admin')} right={<SyncPill />} />
      <div className="mx-auto w-full max-w-md space-y-4 px-5 pb-24 pt-2 md:max-w-2xl lg:max-w-none lg:px-8">
        <p className="text-[13px] leading-relaxed text-ink-muted">
          Set the fees this facility charges and who receives care free of charge. Changes save on this device and sync when connected.
        </p>
        <Button disabled={fees.loading || Boolean(fees.error) || Boolean(busyId)} onClick={() => setEditing('new')}>＋ Add a fee</Button>
        {fees.loading ? (
          <div role="status" aria-label="Loading fees" className="space-y-3">
            <div className="h-28 animate-pulse rounded-card bg-surface-muted" />
            <div className="h-28 animate-pulse rounded-card bg-surface-muted" />
          </div>
        ) : fees.error ? (
          <div role="alert" className="rounded-card border border-outline-soft bg-white p-4">
            <p className="text-[13px] text-danger">Fees could not be read from this device.</p>
            <Button variant="ghost" onClick={fees.reload}>Try again</Button>
          </div>
        ) : all.length === 0 ? (
          <div className="rounded-card border border-dashed border-outline p-5 text-center">
            <h2 className="text-[15px] font-bold text-ink">No fees yet</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">Facilities providing free care can leave this empty. Add a fee when your facility needs to charge for a service.</p>
          </div>
        ) : (
          <>
          <div className="hidden lg:block"><DataTable caption="Facility fee schedule" rows={all} rowKey={(row) => row.id} columns={[
            { key: 'name', label: 'Fee', sortValue: (row) => row.name, render: (row) => <button type="button" className="min-h-0 py-1 text-left font-bold text-brand" onClick={() => setEditing(row)}>{row.name}</button> },
            { key: 'category', label: 'Category', sortValue: (row) => row.category, render: (row) => CATEGORY_LABELS[row.category] },
            { key: 'amount', label: 'Amount', align: 'right', render: (row) => formatMoney(row.amountMinor, row.currency) },
            { key: 'when', label: 'Charged', render: (row) => CHARGE_WHEN_LABELS[row.chargeWhen] },
            { key: 'exempt', label: 'Exemptions', render: (row) => row.exemptions.map((rule) => rule.reason).join(' · ') || 'None' },
            { key: 'active', label: 'Status', render: (row) => row.active ? 'Active' : 'Retired' },
            { key: 'actions', label: 'Actions', render: (row) => <div className="flex flex-wrap gap-2"><Button variant="ghost" fullWidth={false} className="px-2 py-2" disabled={Boolean(busyId)} onClick={() => setEditing(row)}>Edit</Button><Button variant="ghost" fullWidth={false} className="px-2 py-2" loading={busyId === row.id} disabled={Boolean(busyId)} onClick={() => void toggle(row)}>{row.active ? 'Retire' : 'Restore'}</Button></div> },
          ]} /></div>
          <div className="space-y-3 lg:hidden">
            {all.map((fee) => (
              <article key={fee.id} className="rounded-card border border-outline-soft bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className={`text-[16px] font-bold ${fee.active ? 'text-ink' : 'text-ink-muted'}`}>{fee.name}</h2>
                    <p className="mt-1 text-[13px] text-ink-muted">{CATEGORY_LABELS[fee.category]} · {CHARGE_WHEN_LABELS[fee.chargeWhen]}</p>
                  </div>
                  <div className="text-right">
                    <div className="whitespace-nowrap font-mono text-[15px] font-bold text-brand">{formatMoney(fee.amountMinor, fee.currency)}</div>
                    {!fee.active ? <Tag tone="neutral">Retired</Tag> : null}
                  </div>
                </div>
                {fee.exemptions.length > 0 ? (
                  <div className="mt-3 rounded-field bg-brand-wash px-3 py-2 text-[13px] text-brand-strong">
                    Free when eligible: {fee.exemptions.map((rule) => rule.reason).join(' · ')}
                  </div>
                ) : null}
                <div className="mt-3 flex gap-2 border-t border-outline-soft pt-2">
                  <Button variant="ghost" fullWidth={false} className="px-3 py-2" disabled={Boolean(busyId)} onClick={() => setEditing(fee)}>Edit</Button>
                  <Button variant="ghost" fullWidth={false} className="px-3 py-2" disabled={Boolean(busyId)} loading={busyId === fee.id} onClick={() => void toggle(fee)}>
                    {fee.active ? 'Retire' : 'Restore'}
                  </Button>
                </div>
              </article>
            ))}
          </div>
          </>
        )}
      </div>
      {editing ? (
        <FeeEditorSheet key={editing === 'new' ? 'new' : editing.id} fee={editing === 'new' ? undefined : editing} defaultCurrency={all[0]?.currency} onSave={save} onClose={() => setEditing(undefined)} />
      ) : null}
    </div>
  );
};
