import { Link } from 'react-router-dom';
import { useRequestQueues } from '@/modules/clinical/encounter';
import { useAuthorizationContext } from '@/session';
import { Button } from '@/ui';
import type { BillingData } from './useBilling';

/** A financial view of existing pending sources. Never writes clinical facts, charges or payments. */
export const BillingReviewList=({data,onPatient}:{data:BillingData;onPatient:(id:string)=>void})=>{
 const query=useRequestQueues(),context=useAuthorizationContext();
 const requests=query.data?Object.entries(query.data).flatMap(([station,queue])=>[...queue.open,...queue.completed].filter(r=>r.billingPending).map(request=>({station,request}))):[];
 return <section aria-label="Unresolved billing review" className="space-y-4">
  <h2 className="text-lg font-bold">Unresolved billing review</h2>
  <p className="text-sm">These signed requests or actual supplies need financial review. No extra charge, payment or insurance coverage is assumed. Clinical signing remains with authorized clinical staff.</p>
  <p className="text-sm text-ink-muted">Check the patient bill and recorded payments. Ambiguous links stay pending until a supported, explicit decision can be recorded. Opening a bill does not close the review.</p>
  {query.loading?<p role="status">Reading billing review records…</p>:query.error?<div role="alert">Billing review records could not be read.<Button onClick={query.reload}>Try again</Button></div>:!requests.length?<p>No unresolved billing review records on this device.</p>:requests.map(({station,request})=><article key={request.id} className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
   <strong>{data.patients.find(p=>p.patientId===request.patientId)?.fullName??request.patientId}</strong><p className="break-all text-xs">{request.patientId} · {station==='lab'?'Laboratory':'Pharmacy'} · {request.superseded?'Earlier request · ':''}Billing review pending</p>
   {request.billingReviews?.map(item=><div key={item.id} className="space-y-1 border-t border-outline-soft pt-2 text-sm"><p className="font-bold">{item.name}{item.quantity!==undefined?` · ${item.quantity} ${item.unit??''}`:''}</p><p>{item.reason}</p><p>Recorded by {data.staff.find(s=>s.staffId===item.recordedBy)?.fullName??item.recordedBy} · {new Date(item.recordedOn).toLocaleString('en-GB')}</p><p className="break-all font-mono text-xs">Source: {request.id} · Item: {item.id}</p></div>)}
   <div className="flex flex-wrap gap-3"><Button fullWidth={false} variant="outlined" onClick={()=>onPatient(request.patientId)}>Review patient bill</Button>{context.permissions.includes('patient_chart:read')?<Link className="inline-flex min-h-[44px] items-center font-bold text-brand" to={station==='lab'?`${request.superseded?'/encounters/record':'/laboratory/request'}?${new URLSearchParams({patient:request.patientId,visit:request.encounterId})}`:`/pharmacy/request?${new URLSearchParams({patient:request.patientId,visit:request.encounterId,prescription:request.id})}`}>Open clinical source</Link>:null}</div>
   {station==='pharmacy'?<p className="text-xs text-ink-muted">Authorized Pharmacy staff can review this saved supply in Supply and return history. Existing pricing follow-up and return controls still apply.</p>:null}
  </article>)}
 </section>;
};
