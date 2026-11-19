import {AssociationEditor,ServiceReturnReviews} from './ServiceAssociations';
import {useLiveQuery} from '@/data';
import {allOfType} from '@/data/db';
import type {SyncRejection} from '@shared';
import { Link } from 'react-router-dom';
import { useRequestQueues } from '@/modules/clinical/encounter';
import { useAuthorizationContext } from '@/session';
import { Button } from '@/ui';
import type { BillingData } from './useBilling';
const readAssociationRefusals=()=>allOfType<SyncRejection>('sync_rejection');

/** Resolves exact financial associations; clinical authorization remains separate. */
export const BillingReviewList=({data,onPatient}:{data:BillingData;onPatient:(id:string)=>void})=>{
 const query=useRequestQueues(),context=useAuthorizationContext();
 const refusals=useLiveQuery(readAssociationRefusals,['sync_rejection']);
 const requests=query.data?Object.entries(query.data).flatMap(([station,queue])=>[...queue.open,...queue.completed].filter(r=>r.billingPending).map(request=>({station,request}))):[];
 return <section aria-label="Unresolved billing review" className="space-y-4">
  <h2 className="text-lg font-bold">Unresolved billing review</h2>
  <p className="text-sm">These signed requests or actual supplies need financial review. No extra charge, payment or insurance coverage is assumed. Clinical signing remains with authorized clinical staff.</p>
  <p className="text-sm text-ink-muted">Review the exact charge and source evidence, then request an association. Only server acceptance resolves it. Clinical signing and payment collection remain separate.</p>
  {query.loading&&!query.data?<p role="status">Reading billing review records…</p>:query.error?<div role="alert">Billing review records could not be read.<Button onClick={query.reload}>Try again</Button></div>:!requests.length?<p>No unresolved billing review records on this device.</p>:requests.map(({station,request})=><article key={request.id} className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
   <strong>{data.patients.find(p=>p.patientId===request.patientId)?.fullName??request.patientId}</strong><p className="break-all text-xs">{request.patientId} · {station==='lab'?'Laboratory':'Pharmacy'} · {request.superseded?'Earlier request · ':''}Billing review pending</p>
   {request.billingReviews?.map(item=><div key={item.id} className="space-y-1 border-t border-outline-soft pt-2 text-sm"><p className="font-bold">{item.name}{item.quantity!==undefined?` · ${item.quantity} ${item.unit??''}`:''}</p><p>{item.reason}</p><p>Recorded by {data.staff.find(s=>s.staffId===item.recordedBy)?.fullName??item.recordedBy} · {new Date(item.recordedOn).toLocaleString('en-GB')}</p><p className="break-all font-mono text-xs">Source: {request.id} · Item: {item.id}</p><AssociationEditor patientId={request.patientId} sourceKind={station==='lab'?'laboratory':'pharmacy'} sourceEntryId={station==='lab'?request.id:item.id} sourceItemId={item.id} quantity={item.quantity??1} unit={item.unit??'item'} charges={data.charges} onSaved={query.reload}/></div>)}
   <div className="flex flex-wrap gap-3"><Button fullWidth={false} variant="outlined" onClick={()=>onPatient(request.patientId)}>Review patient bill</Button>{context.permissions.includes('patient_chart:read')?<Link className="inline-flex min-h-[44px] items-center font-bold text-brand" to={station==='lab'?`${request.superseded?'/encounters/record':'/laboratory/request'}?${new URLSearchParams({patient:request.patientId,visit:request.encounterId})}`:`/pharmacy/request?${new URLSearchParams({patient:request.patientId,visit:request.encounterId,prescription:request.id})}`}>Open clinical source</Link>:null}</div>
   {station==='pharmacy'?<p className="text-xs text-ink-muted">Authorized Pharmacy staff can review this saved supply in Supply and return history. Existing pricing follow-up and return controls still apply.</p>:null}
  </article>)}
  {refusals.data?.filter(r=>r.entityType==='service_charge_allocation'&&!r.resolvedOn).map(r=><article key={r.id} role="alert" className="space-y-2 rounded-card border border-amber-border bg-amber-bg p-3"><strong>Association needs reconciliation</strong><p>{r.reason}</p><p className="break-all text-xs">{r.entityId} · submitted by {r.attributedTo} · {r.occurredOn}</p><p className="text-sm">The original clinical activity and payments were retained. Review accepted quantities and submit a corrected request, then resolve this refusal in the existing reconciliation queue.</p>{typeof r.refusedRecord?.patientId==='string'?<Button onClick={()=>onPatient(String(r.refusedRecord?.patientId))}>Review patient associations</Button>:null}</article>)}
  <ServiceReturnReviews charges={data.charges} onPatient={onPatient}/>
 </section>;
};
