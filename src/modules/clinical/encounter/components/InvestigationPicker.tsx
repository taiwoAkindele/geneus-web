import { useCallback, useState } from 'react';
import { manualBillCandidates, type FeeItem, type InvestigationItem } from '@shared';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext } from '@/session';
import { loadInvestigationCatalogue, selectInvestigation } from '@/data/repos/investigations';
import { chargesForPatient } from '@/data/repos/billing';
import { useBillingCatalogue } from '@/data/billingCatalogueSupport';
import { CatalogueBrowser } from '@/modules/finance/billing/CatalogueBrowser';
import { Button, SelectField, TextField } from '@/ui';
import { formatMoney } from '@/lib/money';

export const InvestigationPicker=({items,onChange,patientId,encounterId}:{items:InvestigationItem[];onChange:(items:InvestigationItem[])=>void;patientId?:string;encounterId?:string})=>{
 const context=useAuthorizationContext(),expanded=useBillingCatalogue(context),catalogue=useLiveQuery(useCallback(()=>loadInvestigationCatalogue(),[expanded]));
 const bills=useLiveQuery(useCallback(()=>patientId?chargesForPatient(patientId):Promise.resolve([]),[patientId]),['charge']);
 const [custom,setCustom]=useState('');
 const add=(fee:FeeItem)=>{
  const configured=catalogue.data?.items.find(row=>row.central && row.fee.id===fee.id);
  const item=selectInvestigation(configured??{fee,central:true,definition:undefined,offering:undefined});
  if(patientId && manualBillCandidates(bills.data??[],patientId,fee.id,encounterId).length)item.billingReviewReason='An existing manual bill may cover this investigation; billing review required';
  onChange([...items,item]);
 };
 const update=(id:string,patch:Partial<InvestigationItem>)=>onChange(items.map(i=>i.id===id?{...i,...patch}:i));
 return <div className="space-y-4">
  <CatalogueBrowser initialCategory="laboratory" canSelect={f=>f.category==='laboratory' && expanded && f.priceEvidenceVersion===1 && !items.some(i=>i.feeItemId===f.id)} onSelect={add}/>
  <p className="text-sm text-ink-muted">This order form selects Laboratory investigations. Other categories remain discoverable; use their authorized workflow or direct Billing.</p>
  {!expanded?<p role="status">Central fee-only ordering is waiting for the facility’s compatible devices. Existing configured investigations remain usable.</p>:null}
  {catalogue.error?<p role="alert">Clinical catalogue could not be read.</p>:null}
  {catalogue.data?.items.filter(r=>!r.central).map(row=><div key={row.offering!.id} className="flex flex-wrap items-center gap-3 rounded-field border border-outline-soft p-3"><span>{row.offering!.name} · {row.fee?formatMoney(row.fee.amountMinor,row.fee.currency):'Unpriced operational request'}</span><Button variant="outlined" fullWidth={false} disabled={items.some(i=>i.offeringId===row.offering!.id)} onClick={()=>onChange([...items,selectInvestigation(row)])}>Add configured investigation</Button></div>)}
  <div className="space-y-2"><TextField label="Unlisted investigation request" value={custom} onChange={e=>setCustom(e.target.value)}/><Button variant="outlined" disabled={!custom.trim()} onClick={()=>{onChange([...items,{id:`order_item:${crypto.randomUUID()}`,name:custom.trim(),custom:true,priority:'routine'}]);setCustom('');}}>Add unpriced request</Button></div>
  <h3 className="font-bold">Selected investigations ({items.length})</h3>
  {items.map(item=><div key={item.id} className="space-y-2 rounded-field border border-outline-soft p-3"><strong>{item.name}</strong><p>{item.priceMinor===undefined?'Price pending review':formatMoney(item.priceMinor,item.currency!)}</p>
   {item.catalogueSource==='billing'?<TextField label="Specimen / collection note (when clinically needed)" value={item.specimen??''} onChange={e=>update(item.id,{specimen:e.target.value||undefined})}/>:null}
   {item.billingReviewReason || item.additionalChargeReason!==undefined?<><p className="text-sm text-amber-text">A prior manual bill may cover this activity. No payment or coverage is inferred.</p><SelectField label="Billing decision" value={item.additionalChargeReason!==undefined?'additional':'review'} options={[{value:'review',label:'Keep for billing review — create no second charge'},{value:'additional',label:'This is a separate additional investigation'}]} onChange={e=>update(item.id,e.target.value==='additional'?{billingReviewReason:undefined,additionalChargeReason:''}:{billingReviewReason:'Review the existing manual bill before charging',additionalChargeReason:undefined})}/>{item.additionalChargeReason!==undefined?<TextField label="Reason for an additional charge" required value={item.additionalChargeReason} onChange={e=>update(item.id,{additionalChargeReason:e.target.value})}/>:null}</>:null}
   {item.billingReviewReason?<p role="status" className="text-sm text-amber-text">Billing review required. Signing will record the clinical request without a second charge.</p>:null}
   <Button variant="ghost" fullWidth={false} onClick={()=>onChange(items.filter(i=>i.id!==item.id))}>Remove</Button></div>)}
  <p className="text-sm text-ink-muted">Only signing creates orders and applicable charges. Missing operational details do not prevent direct Billing.</p>
 </div>;
};
