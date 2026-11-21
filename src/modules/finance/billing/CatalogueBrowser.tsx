import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FeeCategory, type FeeItem } from '@shared';
import { useLiveQuery } from '@/data';
import { cataloguePage } from '@/data/repos/billing';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, TextField } from '@/ui';
import { formatMoney } from '@/lib/money';
import { CATEGORY_LABELS } from './feeForm';

/** Shared discovery only. Callers retain their clinical and financial action permissions. */
export const CatalogueBrowser=({initialCategory='',onSelect,canSelect}:{initialCategory?:string;onSelect?:(fee:FeeItem)=>void;canSelect?:(fee:FeeItem)=>boolean})=>{
 const context=useAuthorizationContext();
 const [search,setSearch]=useState(''),[category,setCategory]=useState(initialCategory),[page,setPage]=useState(0);
 useEffect(()=>{setCategory(initialCategory);setPage(0);},[initialCategory]);
 const query=useLiveQuery(useCallback(()=>cataloguePage({search,category,page,facilityId:context.facilityId}),[search,category,page,context.facilityId]),['fee_item']);
 return <section aria-label="Hospital price catalogue" className="space-y-3">
  <div className="grid gap-3 sm:grid-cols-2"><TextField label="Search hospital catalogue" type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/><SelectField label="Catalogue category" value={category} onChange={e=>{setCategory(e.target.value);setPage(0);}} options={[{value:'',label:'All categories'},...FeeCategory.options.map(value=>({value,label:CATEGORY_LABELS[value]}))]}/></div>
  <p className="text-sm text-ink-muted">Categories organize prices. Choose All categories to search the whole hospital. Clinical permissions still apply.</p>
  {query.loading?<p role="status">Reading catalogue…</p>:query.error?<div role="alert">Catalogue could not be read.<Button variant="ghost" onClick={query.reload}>Try again</Button></div>:!query.data?.items.length?<p>No active items match.</p>:<ul className="divide-y divide-outline-soft rounded-card border border-outline-soft">{query.data.items.map(f=><li key={f.id} className="flex flex-wrap items-center justify-between gap-3 p-3"><div><strong>{f.name}</strong><p className="text-sm text-ink-muted">{CATEGORY_LABELS[f.category]} · {formatMoney(f.amountMinor,f.currency)}</p></div>{onSelect?<Button variant="outlined" fullWidth={false} disabled={canSelect?!canSelect(f):false} onClick={()=>onSelect(f)}>Select item</Button>:null}</li>)}</ul>}
  {query.data && query.data.total>25?<div className="flex items-center gap-3"><Button variant="ghost" fullWidth={false} disabled={!page} onClick={()=>setPage(page-1)}>Previous</Button><span>Page {page+1} of {Math.ceil(query.data.total/25)}</span><Button variant="ghost" fullWidth={false} disabled={(page+1)*25>=query.data.total} onClick={()=>setPage(page+1)}>Next</Button></div>:null}
  {context.permissions.includes('fee_item:manage')?<Link className="inline-flex min-h-[44px] items-center font-bold text-brand" to="/billing/prices">Manage prices in Billing</Link>:null}
  <p className="text-xs text-ink-muted">Prices last received on this device. New items appear through normal synchronization.</p>
 </section>;
};
