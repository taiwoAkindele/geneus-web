import { useEffect, useState } from 'react';
import type { FeeItem } from '@shared';
import { Button, useToast } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { useLiveQuery } from '@/data';
import { getFacility } from '@/data/repos/facility';
import { createFeeItem, updateFeeItem, type FeeDraft } from '@/data/repos/billing';
import { useBilling } from './useBilling';
import { FeeCatalog } from './FeeCatalog';
import { FeeEditorSheet } from './FeeEditorSheet';

/**
 * Billing → Settings → Fees: the facility's price list. Everyone in Billing can
 * read it; only fee managers add, edit or retire a fee. Existing patient bills
 * keep the price they were raised at.
 */
export const FeeSettings = () => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const query = useBilling();
  // New prices start in the facility's currency; each fee keeps its own.
  const facilityCurrency = useLiveQuery(getFacility, ['facility']).data?.currency;
  const [editing, setEditing] = useState<FeeItem | 'new'>();
  useEffect(() => { document.title = 'Fees · Billing settings · Geneus Health'; }, []);
  const canManage = context.permissions.includes('fee_item:manage');
  const save = async (draft: FeeDraft) => {
    if (editing && editing !== 'new') await updateFeeItem(editing.id, draft, context);
    else await createFeeItem(draft, context);
    toast(editing === 'new' ? 'Fee added on this device.' : 'Fee updated on this device.');
    setEditing(undefined); query.reload();
  };
  const data = query.data;
  return <div className="space-y-4 px-4 py-5 md:px-8">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-extrabold">Fees</h1>{canManage ? <Button fullWidth={false} disabled={query.loading || Boolean(query.error)} onClick={() => setEditing('new')}>Add fee</Button> : null}</header>
    {query.loading ? <div role="status" className="h-40 animate-pulse rounded-card bg-surface-muted" aria-label="Loading fees" />
      : query.error || !data ? <div role="alert">Fees could not be read.<Button variant="ghost" onClick={query.reload}>Try again</Button></div>
      : <FeeCatalog fees={data.fees} onEdit={setEditing} onChanged={query.reload} />}
    {editing && canManage ? <FeeEditorSheet key={editing === 'new' ? 'new' : editing.id} fee={editing === 'new' ? undefined : editing} defaultCurrency={facilityCurrency ?? data?.fees[0]?.currency ?? 'NGN'} onSave={save} onClose={() => setEditing(undefined)} /> : null}
  </div>;
};
