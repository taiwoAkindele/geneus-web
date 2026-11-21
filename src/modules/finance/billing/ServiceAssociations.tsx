import {Link} from 'react-router-dom';
import {StaffVerification} from '@/modules/insurance/StaffVerification';
import {billingRequest} from '@/lib/api/billing';
import {useState} from 'react';
import {currentAllocation,type CoverageAllocation,allocatedQuantity,creditedQuantity,dispensingDetails,type Charge,type EncounterEntry,type ServiceChargeAllocation} from '@shared';
import {useLiveQuery} from '@/data';
import {allOfType} from '@/data/db';
import {listServiceAllocations,requestServiceAllocation} from '@/data/repos/serviceAllocations';
import {useIntegratedBilling} from '@/data/integratedBillingSupport';
import {useAuthorizationContext} from '@/session';
import {Button,SelectField,TextField} from '@/ui';
import {formatMoney} from '@/lib/money';

export const AssociationEditor=({patientId,sourceKind,sourceEntryId,sourceItemId,quantity,unit,charges,onSaved}:{patientId:string;sourceKind:'laboratory'|'pharmacy';sourceEntryId:string;sourceItemId:string;quantity:number;unit:string;charges:readonly Charge[];onSaved:()=>void})=>{
 const context=useAuthorizationContext(),enabled=useIntegratedBilling(context),query=useLiveQuery(listServiceAllocations,['service_charge_allocation','sync_rejection']);
 const [chargeId,setCharge]=useState(''),[amount,setAmount]=useState(String(quantity)),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const records=query.data??[],used=allocatedQuantity(records,a=>a.sourceEntryId===sourceEntryId&&a.sourceItemId===sourceItemId),pending=records.filter(a=>!a.acceptedOn&&a.sourceEntryId===sourceEntryId&&a.sourceItemId===sourceItemId);
 if(!context.permissions.includes('charge:associate'))return <p className="text-xs">An authorized financial reviewer can record the exact charge association.</p>;
 if(used>=quantity-1e-6)return <p role="status" className="text-sm">Server-confirmed association: {used} {unit}. Clinical completion and payment are recorded separately.</p>;
 const candidates=charges.filter(c=>c.patientId===patientId&&(c.category===sourceKind||sourceKind==='pharmacy'&&Boolean(c.dispenseEntryId)));
 return <div className="space-y-2 rounded-field bg-surface p-3">
 <p className="text-sm">Associate an existing charge · {used} of {quantity} {unit} confirmed</p>
 {!enabled?<p className="text-xs">Waiting for compatible devices and older sync tokens. Cash collections remain available.</p>:null}
 {pending.length?<p role="status">Association awaiting server confirmation. It is not finalized.</p>:null}
 <SelectField label="Exact patient charge" value={chargeId} onChange={e=>setCharge(e.target.value)} options={[{value:'',label:'Select the charge after reviewing its evidence'},...candidates.map(c=>({value:c.id,label:`${c.description} · ${formatMoney(c.listPriceMinor,c.currency)} · ${c.quantity??'Unknown quantity'} ${c.unitOfMeasure??''} · ${c.id}`}))]}/>
 {chargeId?<p className="text-xs">Remaining purchased quantity: {(()=>{const c=candidates.find(c=>c.id===chargeId)!;return c.quantity===undefined?'Historical quantity unavailable':Math.max(0,c.quantity-allocatedQuantity(records,a=>a.chargeId===c.id)-creditedQuantity(records,c.id));})()}. Payment alone does not identify this service.{!candidates.find(c=>c.id===chargeId)?.unitOfMeasure?' This charge has no recorded unit. Verify its purchase evidence: the first accepted association records this exact source unit and cannot infer a pack conversion.':''}</p>:null}
 <TextField label={`Quantity to associate (${unit})`} type="number" value={amount} onChange={e=>setAmount(e.target.value)}/>
 <TextField label="Evidence and reason for this exact association" value={reason} onChange={e=>setReason(e.target.value)}/>
 <Button disabled={!enabled||busy||query.loading||Boolean(query.error)||!chargeId||reason.trim().length<3||pending.length>0||!(Number(amount)>0)} onClick={()=>{setBusy(true);setError('');void requestServiceAllocation({patientId,chargeId,sourceKind,sourceEntryId,sourceItemId,quantity:Number(amount),unit,action:'allocate',reason,creditReturnedUnits:false},context).then(()=>{query.reload();onSaved();setReason('');},e=>setError(e instanceof Error?e.message:'Could not save association')).finally(()=>setBusy(false));}}>Request charge association</Button>
 {error?<p role="alert">{error}</p>:null}</div>;
};

const readAssociationHistory=async()=>{const [allocations,entries,charges,coverageDecisions]=await Promise.all([listServiceAllocations(),allOfType<EncounterEntry>('encounter_entry'),allOfType<Charge>('charge'),allOfType<CoverageAllocation>('coverage_allocation')]);return {allocations,entries,charges,coverageDecisions};};
export const ServiceReturnReviews=({charges,onPatient,patientId}:{charges:Charge[];onPatient:(id:string)=>void;patientId?:string})=>{
 const query=useLiveQuery(readAssociationHistory,['service_charge_allocation','encounter_entry']);
 const allocations=query.data?.allocations??[],entries=query.data?.entries??[];
 const reviews=entries.filter(e=>!patientId||e.patientId===patientId).flatMap(e=>{
  const d=dispensingDetails(e);if(d?.action!=='return'||d.creditMinor!==0)return [];
  const source=entries.find(s=>s.id===d.returnOf),supply=source&&dispensingDetails(source);
  if(!source||supply?.billing==='outside')return [];
  const resolved=allocations.filter(a=>a.acceptedOn&&a.returnEntryId===e.id).reduce((n,a)=>n+a.quantity,0);
  return resolved+0.000001<d.quantity!?[{entry:e,source,supply,quantity:d.quantity!-resolved,unit:d.unit}]:[];
 });
 return <section aria-label="Returned supplies awaiting financial resolution" className="space-y-3"><h3 className="font-bold">Returns awaiting financial review</h3>{query.error?<p role="alert">Could not read recorded returns.</p>:reviews.length?reviews.map(r=><article key={r.entry.id} className="space-y-2 rounded-card border border-amber-border bg-amber-bg p-3"><p>{r.quantity} {r.unit} returned · {r.entry.patientId}</p><p className="break-all text-xs">Return {r.entry.id} · supply {r.source.id} · recorded by {r.entry.createdBy}</p><p className="text-sm">The physical return is retained. It is not an automatic refund or insurer responsibility change. Associate the original purchased quantity if necessary, then review its exact release in the patient account.</p><AssociationEditor patientId={r.entry.patientId} sourceKind="pharmacy" sourceEntryId={r.source.id} sourceItemId={r.source.id} quantity={r.supply?.quantity??r.quantity} unit={r.unit!} charges={charges} onSaved={query.reload}/><Button onClick={()=>onPatient(r.entry.patientId)}>Review return and patient account</Button></article>):<p className="text-sm">No recorded returns awaiting financial resolution on this device.</p>}</section>;
};
export const ServiceAssociationHistory=({patientId}:{patientId:string})=>{
 const query=useLiveQuery(readAssociationHistory,['service_charge_allocation','encounter_entry','coverage_allocation']),context=useAuthorizationContext(),enabled=useIntegratedBilling(context);
 const [selected,setSelected]=useState<ServiceChargeAllocation>(),[quantity,setQuantity]=useState('1'),[returnId,setReturn]=useState(''),[credit,setCredit]=useState(false),[reason,setReason]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[insuranceRequestId,setInsuranceRequest]=useState(()=>crypto.randomUUID());
 const records=(query.data?.allocations??[]).filter(a=>a.patientId===patientId),returns=(query.data?.entries??[]).filter(e=>e.patientId===patientId&&dispensingDetails(e)?.action==='return');
 const relevantReturns=selected?returns.filter(e=>dispensingDetails(e)?.returnOf===selected.sourceEntryId):[];
 const insured=Boolean(selected&&currentAllocation(selected.chargeId,query.data?.coverageDecisions??[])?.state==='finalised');
 const mayCredit=context.permissions.includes(insured?'coverage:confirm':'payment:waive');
 const save=async()=>{
  if(!selected)return;setBusy(true);setError('');setNotice('');
  const input={patientId,chargeId:selected.chargeId,sourceKind:selected.sourceKind,sourceEntryId:selected.sourceEntryId,sourceItemId:selected.sourceItemId,unit:selected.unit,quantity:Number(quantity),action:'release' as const,reversesId:selected.id,...(returnId?{returnEntryId:returnId}:{}),creditReturnedUnits:credit,reason};
  try{
   if(insured&&credit){const result=await billingRequest<{claimReviewRequired:boolean}>(context,'associations/insurance-return',{requestId:insuranceRequestId,input});setNotice(result.claimReviewRequired?'Insurance return confirmed. Review the affected claim revision in Insurance; earlier payments remain intact.':'Insurance return confirmed using the original calculation rules. Any patient refund remains a separate verified action.');}
   else{await requestServiceAllocation(input,context);setNotice('Financial release requested. It remains pending until server confirmation.');}
   query.reload();setSelected(undefined);
  }catch(e){setError(e instanceof Error?e.message:'Could not save release');}finally{setBusy(false);}
 };
 if(query.loading&&!query.data)return <p>Reading service associations…</p>;
 if(query.error)return <p role="alert">Could not read service associations.</p>;
 if(!records.length)return null;
 const submit=<Button disabled={busy||!enabled||reason.trim().length<3||!(Number(quantity)>0)||(credit&&!mayCredit)} onClick={()=>void save()}>{insured&&credit?'Confirm insurance return':'Request financial release'}</Button>;
 return <section aria-label="Service association history" className="space-y-3 border-t border-outline-soft pt-4"><h3 className="font-bold">Service associations and returns</h3>
 {notice?<p role="status" className="text-sm">{notice}</p>:null}{notice&&context.permissions.includes('coverage:confirm')?<Link className="inline-flex min-h-[44px] items-center text-brand" to="/insurance/claims">Review payer claims in Insurance</Link>:null}
 {records.map(a=><article key={a.id} className="space-y-1 rounded-field border border-outline-soft p-3 text-sm"><p>{a.sourceKind==='pharmacy'?'Pharmacy':'Laboratory'} · {a.action} {a.quantity} {a.unit} · {a.acceptedOn?'Server confirmed':'Awaiting server confirmation'}</p><p className="break-all text-xs">Charge {a.chargeId} · source {a.sourceEntryId} · item {a.sourceItemId}</p><p>{a.reason} · {a.createdBy} · {new Date(a.acceptedOn??a.createdOn).toLocaleString('en-GB')}</p>{a.creditMinor!==undefined&&a.creditReturnedUnits?<p>Patient return credit {formatMoney(a.creditMinor,query.data?.charges.find(c=>c.id===a.chargeId)?.currency??'NGN')}. A refund requires its own verified action.</p>:null}
 {a.action==='allocate'&&a.acceptedOn&&context.permissions.includes('charge:associate')?<Button fullWidth={false} variant="outlined" onClick={()=>{setSelected(a);setQuantity('1');setReturn('');setCredit(false);setReason('');setError('');setInsuranceRequest(crypto.randomUUID());}}>Review return or correct association</Button>:null}</article>)}
 {selected?<div className="space-y-2 rounded-field bg-surface p-3"><h4 className="font-bold">Release accepted quantity</h4><p className="text-sm">A correction frees capacity. A return without a credit leaves purchased capacity available for a replacement supply. A credited return extinguishes the returned purchase. Clinical activity and payment history stay intact.</p>
 <SelectField label="Actual return (or association correction)" value={returnId} onChange={e=>{setReturn(e.target.value);setCredit(false);}} options={[{value:'',label:'Correct an incorrect association; no money credit'},...relevantReturns.map(e=>({value:e.id,label:`${dispensingDetails(e)?.quantity} ${dispensingDetails(e)?.unit} · ${new Date(e.createdOn).toLocaleString('en-GB')} · ${e.id}`}))]}/>
 <TextField label={`Quantity (${selected.unit})`} type="number" value={quantity} onChange={e=>setQuantity(e.target.value)}/>
 {returnId&&mayCredit?<label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={credit} onChange={e=>setCredit(e.target.checked)}/>{insured?'Recalculate returned units under the confirmed insurance rules':'Credit returned purchased units'}</label>:null}
 {returnId&&insured?<p className="text-xs">Insurance returns need a connected, verified insurance reviewer. The original decision remains in history; a new calculation covers the remaining units. Cash refunds are separate.</p>:null}
 <TextField label="Release reason and evidence" value={reason} onChange={e=>setReason(e.target.value)}/>
 {insured&&credit?<StaffVerification requireServerSession purpose="Confirming an insured medicine return">{submit}</StaffVerification>:submit}<Button variant="ghost" onClick={()=>setSelected(undefined)}>Cancel</Button>{error?<p role="alert">{error}</p>:null}
 </div>:null}</section>;
};
