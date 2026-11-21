import { useEffect, useState } from 'react';
import { PriceUpload } from './PriceUpload';
import {downloadCsv} from '@/lib/csv';
import {amountInput} from '@/lib/money';
import type { FeeItem } from '@shared';
import { Button, useToast } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { useLiveQuery } from '@/data';
import { getFacility } from '@/data/repos/facility';
import { createFeeItem, updateCatalogueItem, updateFeePolicy, type FeeDraft } from '@/data/repos/billing';
import { useBilling } from './useBilling';
import { FeeCatalog } from './FeeCatalog';
import { FeeEditorSheet } from './FeeEditorSheet';
import { FeePoliciesSheet } from './FeePoliciesSheet';
import { CatalogueReadiness } from './CatalogueReadiness';
import { useBillingCatalogue } from '@/data/billingCatalogueSupport';

/**
 * Billing → Settings → Fees: the facility's price list. Everyone in Billing can
 * read it; only fee managers add, edit or retire a fee. Existing patient bills
 * keep the price they were raised at.
 */
export const FeeSettings = () => {
  const context = useAuthorizationContext();
  const expandedCategories=useBillingCatalogue(context);
  const toast = useToast();
  const query = useBilling();
  // New prices start in the facility's currency; each fee keeps its own.
  const facilityCurrency = useLiveQuery(getFacility, ['facility']).data?.currency;
  const [editing, setEditing] = useState<FeeItem | 'new'>();
  const [upload,setUpload]=useState(false);
  const [policy, setPolicy] = useState<FeeItem>();
  useEffect(() => { document.title = 'Price Catalogue · Billing · Geneus Health'; }, []);
  const canManage = context.permissions.includes('fee_item:manage');
  const save = async (draft: FeeDraft) => {
    if (editing && editing !== 'new') await updateCatalogueItem(editing, draft, context);
    else await createFeeItem(draft, context);
    toast(editing === 'new' ? 'Item saved on the server.' : 'Item updated on the server.');
    setEditing(undefined); query.reload();
  };
  const data = query.data;
  return <div className="space-y-4 px-4 py-5 md:px-8">
    {canManage?<details className="rounded-card border border-outline-soft bg-white p-4"><summary className="cursor-pointer font-bold">Advanced catalogue compatibility</summary><CatalogueReadiness/></details>:null}
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-extrabold">Price Catalogue</h1>{canManage ? <div className="flex flex-wrap gap-2"><Button fullWidth={false} disabled={!data} onClick={()=>setUpload(true)}>Upload prices</Button><Button variant="outlined" fullWidth={false} disabled={!data} onClick={() => setEditing('new')}>Add one item</Button><Button variant="ghost" fullWidth={false} disabled={!data} onClick={()=>downloadCsv('current-billing-prices.csv',[['Name','Category','Price','Description','Item ID'],...(data?.fees??[]).filter(f=>f.active&&f.currency===(facilityCurrency??'NGN')).map(f=>[f.name,f.category,amountInput(f.amountMinor,f.currency),f.description??'',f.id])])}>Export prices</Button></div> : null}</header>
    {query.loading ? <div role="status" className="h-40 animate-pulse rounded-card bg-surface-muted" aria-label="Loading fees" />
      : query.error || !data ? <div role="alert">Fees could not be read.<Button variant="ghost" onClick={query.reload}>Try again</Button></div>
      : <FeeCatalog fees={data.fees} onEdit={setEditing} onPolicy={setPolicy} onChanged={query.reload} />}
    {upload && canManage && data ? <PriceUpload fees={data.fees} currency={facilityCurrency??'NGN'} onClose={()=>setUpload(false)} onSaved={query.reload}/>:null}
    {editing && canManage ? <FeeEditorSheet expandedCategories={expandedCategories} key={editing === 'new' ? 'new' : editing.id} fee={editing === 'new' ? undefined : editing} defaultCurrency={facilityCurrency ?? 'NGN'} onSave={save} onClose={() => setEditing(undefined)} /> : null}
    {policy && canManage ? <FeePoliciesSheet fee={policy} onClose={() => setPolicy(undefined)} onSave={async (values) => { await updateFeePolicy(policy, values, context); toast('Policy saved on the server.'); setPolicy(undefined); query.reload(); }} /> : null}
  </div>;
};
