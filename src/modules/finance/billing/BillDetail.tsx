import {useCallback,useRef,useState} from 'react';
import type {CoverageFinancialSummary,IncomingTransfer,Payment} from '@shared';
import {useLiveQuery} from '@/data';
import {allWhere} from '@/data/db';
import {ActionMenu,Button,Sheet,useToast} from '@/ui';
import {useAuthorizationContext} from '@/session';
import type {BillDocument} from './billDocuments';
import type {BillingData} from './useBilling';
import type {BillingQuestion} from './billingQuestions';
import {CATEGORY_LABELS} from './feeForm';
import {ReceivePayment} from './ReceivePayment';
import {AdjustBill} from './AdjustBill';
import {PatientStatement} from './PatientStatement';
import {PatientLinkPanel,canMakePatientLinks} from './PatientLinkPanel';
import {messageActivity,messagesFor} from '@/data/repos/patientContacts';
import {BillingReviewList} from './BillingReviewList';
import {BillStatus,QuestionFlag,displayMoney,whenText} from './billingUi';

type Event={id:string;at:string;text:string;by:string;amount?:number;payment?:Payment};

/** One bill: who it's for, what is due, one way to receive payment; everything else is in the ⋯ menu. */
export const BillDetail=({bill,data,transfer,questions,onBack,onReceipt,onSaved,onOpenPatient}:{bill:BillDocument;data:BillingData;transfer?:IncomingTransfer;questions:readonly BillingQuestion[];onBack:()=>void;onReceipt:(p:Payment,fresh:boolean)=>void;onSaved:()=>void;onOpenPatient:(patientId:string)=>void})=>{
 const context=useAuthorizationContext(),toast=useToast(),root=useRef<HTMLDivElement>(null);
 const [sheet,setSheet]=useState<'pay'|'adjust'|'statement'|'questions'|'link'|undefined>(transfer?'pay':undefined),[error,setError]=useState('');
 const summaries=useLiveQuery(useCallback(()=>allWhere<CoverageFinancialSummary>('coverage_financial_summary','patientId',bill.patientId),[bill.patientId]),['coverage_financial_summary']);
 const money=(n:number)=>displayMoney(n,bill.currency),patient=data.patients.find(p=>p.patientId===bill.patientId);
 const staff=(id:string)=>data.staff.find(s=>s.staffId===id)?.fullName??id;
 const chargeIds=bill.rows.map(r=>r.charge.id);
 const insured=bill.rows.some(r=>r.coverage)||bill.pending>0;
 const canReceive=context.permissions.includes('payment:receive')&&bill.due>0;
 const raisedBy=bill.rows.map(r=>r.charge).sort((a,b)=>a.createdOn.localeCompare(b.createdOn))[0];
 const sends=useLiveQuery(useCallback(()=>messagesFor(bill.id),[bill.id]),['patient_message']);
 const events:Event[]=[
  // Each SMS or email of this bill to the patient, with its outcome.
  ...(sends.data??[]).map(m=>({id:m.id,at:m.createdOn,text:messageActivity(m).text,by:m.automatic?'Automatically':staff(m.createdBy)})),
  ...(raisedBy?[{id:'raised',at:raisedBy.createdOn,text:`Bill raised · ${bill.rows.length} ${bill.rows.length===1?'item':'items'}`,by:staff(raisedBy.createdBy)}]:[]),
  ...[...new Map(bill.rows.flatMap(r=>r.receipts).map(p=>[p.id,p])).values()].map(p=>({id:p.id,at:p.createdOn,payment:p,by:staff(p.createdBy),
   amount:(p.reverses?-1:1)*p.allocations.filter(a=>chargeIds.includes(a.chargeId)).reduce((n,a)=>n+a.amountMinor,0),
   text:p.reverses?'Payment reversed':p.method==='waiver'?'Waived':p.method==='cash'?'Cash received':p.method==='online'?(data.transfers.find(t=>t.id===p.incomingTransferId)?.mode==='test'?'Paid online (TEST, not real money)':'Paid online'):'Bank transfer applied'})),
  ...data.adjustments.filter(a=>chargeIds.includes(a.chargeId)).map(a=>({id:a.id,at:a.createdOn,by:staff(a.createdBy),amount:-a.amountMinor,text:`${a.dispenseEntryId?'Medicine return credit':a.kind==='discount'?'Discount':'Waiver'} · ${a.reason}`})),
  ...data.coverage.refunds.filter(r=>r.allocations.some(a=>chargeIds.includes(a.chargeId))).map(r=>({id:r.id,at:r.createdOn,by:staff(r.createdBy),amount:-r.allocations.filter(a=>chargeIds.includes(a.chargeId)).reduce((n,a)=>n+a.amountMinor,0),text:`Refund handed back · ${r.method}`})),
 ].sort((a,b)=>b.at.localeCompare(a.at));
 const print=()=>{const popup=window.open('','_blank','width=900,height=1000');if(!popup||!root.current){const message='The print window was blocked. Allow pop-ups for this app and try again.';setError(message);toast(message,{tone:'error'});return;}setError('');popup.document.title=bill.reference;
  const style=popup.document.createElement('style');style.textContent='body{font:14px Arial;color:#18342b;margin:30px}table{width:100%;border-collapse:collapse}th,td{padding:8px;text-align:left;border-bottom:1px solid #ddd}.r{text-align:right}.print-hide,.md\\:hidden{display:none!important}';popup.document.head.append(style);
  const heading=popup.document.createElement('p');heading.textContent=new Date().toLocaleString('en-GB');popup.document.body.append(heading,root.current.cloneNode(true));popup.focus();popup.print();};
 const line=(r:BillDocument['rows'][number])=>{
  const summary=summaries.data?.find(s=>r.coverage&&'allocation' in r.coverage&&s.allocationId===r.coverage.allocation.id);
  const notes=[r.charge.exemptionReason?`Exempt: ${r.charge.exemptionReason}`:'',r.discountMinor||r.waivedMinor?`Reduced by ${money(r.discountMinor+r.waivedMinor)}`:'',summary?`Insurer pays ${money(summary.payerShareMinor)}`:'',r.undeterminedMinor?`${money(r.undeterminedMinor)} waiting for insurance`:'',r.estimated?'Estimated share':'',r.refundedMinor?`Refunded ${money(r.refundedMinor)}`:''].filter(Boolean);
  return notes.length?<p className="mt-0.5 text-xs text-ink-muted">{notes.join(' · ')}</p>:null;};
 const categories=[...new Set(bill.rows.map(r=>r.charge.category))];
 const quantity=(r:BillDocument['rows'][number])=>r.charge.quantity??1;
 const unitPrice=(r:BillDocument['rows'][number])=>r.charge.unitPriceMinor??Math.round(r.charge.listPriceMinor/quantity(r));
 return <div className="space-y-4 pb-24 lg:pb-0">
  <Button variant="ghost" fullWidth={false} className="!px-0 !py-2" onClick={onBack}>← Bills</Button>
  <article ref={root} className="overflow-hidden rounded-card border border-outline-soft bg-white">
   <header className="flex flex-wrap items-end justify-between gap-4 border-b border-outline-soft p-4 md:p-5">
    <div className="min-w-0 space-y-1"><h1 className="text-2xl font-extrabold">{patient?.fullName??bill.patientId}</h1><p className="text-sm text-ink-muted">{bill.patientId}{insured?' · Insured':' · Self-pay'}</p><p className="font-mono text-xs text-ink-muted">Bill {bill.reference} · raised {new Date(bill.createdOn).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</p></div>
    <div className="flex flex-col items-start gap-2 md:items-end">
     <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Amount due</p>
     <p className="text-3xl font-extrabold tabular-nums">{money(bill.due)}</p>
     <div className="flex flex-wrap items-center gap-2"><BillStatus status={bill.status}/>{bill.pending?<span className="text-xs text-ink-muted">+ {money(bill.pending)} waiting for insurance</span>:null}{bill.credit?<span className="text-xs text-ink-muted">Credit {money(bill.credit)}</span>:null}</div>
     <div className="print-hide flex items-center gap-2"><span className="rounded-field border-[1.5px] border-outline"><ActionMenu compact label="More actions for this bill" actions={[{label:'Print bill',icon:'print',onSelect:print},{label:'Patient statement',onSelect:()=>setSheet('statement')},...(canMakePatientLinks(context)?[{label:'Send to patient',onSelect:()=>setSheet('link')}]:[]),{label:'Adjust bill',onSelect:()=>setSheet('adjust')}]}/></span>
      {canReceive?<Button fullWidth={false} className="hidden lg:inline-flex" onClick={()=>setSheet('pay')}>Receive payment</Button>:null}</div>
    </div>
   </header>
   {questions.length?<div className="print-hide px-4 pt-4 md:px-5"><div className="flex flex-wrap items-center gap-3 rounded-field border border-amber-border bg-amber-bg p-3 text-sm text-amber-text"><p className="min-w-0 flex-1"><strong>{questions.length===1?`${questions[0].name} needs a billing decision.`:`${questions.length} items need a billing decision.`}</strong> A clinical order may already be covered by a charge on this bill. Check before taking payment for it.</p><Button variant="outlined" fullWidth={false} onClick={()=>setSheet('questions')}>Review</Button></div></div>:null}
   <div className="hidden md:block"><table className="w-full text-left text-sm tabular-nums"><thead><tr className="text-xs uppercase tracking-wide text-ink-muted">{['Item','Qty','Price','Paid','Due'].map((h,i)=><th key={h} className={`px-5 py-3 font-bold ${i?'r text-right':''}`}>{h}</th>)}</tr></thead>
    <tbody>{categories.map(category=>[<tr key={category}><td colSpan={5} className="bg-surface-muted px-5 py-2 text-xs font-bold uppercase tracking-wide text-ink-soft">{CATEGORY_LABELS[category]}</td></tr>,
     ...bill.rows.filter(r=>r.charge.category===category).map(r=><tr key={r.charge.id} className="border-t border-outline-soft align-top"><td className="px-5 py-3"><span className="font-semibold">{r.charge.description}</span>{questions.some(q=>q.name===r.charge.description)?<span className="ml-2"><QuestionFlag>Check</QuestionFlag></span>:null}{line(r)}</td><td className="r px-5 py-3 text-right">{quantity(r)}{r.charge.unitOfMeasure?` ${r.charge.unitOfMeasure}`:''}</td><td className="r px-5 py-3 text-right">{money(unitPrice(r))}</td><td className="r px-5 py-3 text-right">{r.settledMinor?money(r.settledMinor):'—'}</td><td className="r px-5 py-3 text-right font-semibold">{money(Math.max(0,r.balanceMinor))}</td></tr>)])}
     <tr className="border-t-2 border-outline-soft font-bold"><td className="px-5 py-3">Total</td><td/><td className="r px-5 py-3 text-right">{money(bill.original)}</td><td className="r px-5 py-3 text-right">{money(bill.paid)}</td><td className="r px-5 py-3 text-right text-base font-extrabold">{money(bill.due)}</td></tr></tbody></table></div>
   <div className="space-y-3 p-4 md:hidden">{categories.map(category=><section key={category} className="space-y-2"><h2 className="text-xs font-bold uppercase tracking-wide text-brand-strong">{CATEGORY_LABELS[category]}</h2>{bill.rows.filter(r=>r.charge.category===category).map(r=><div key={r.charge.id} className="rounded-field border border-outline-soft p-3"><div className="flex justify-between gap-3"><span className="font-semibold">{r.charge.description}</span><span className="font-semibold tabular-nums">{money(Math.max(0,r.balanceMinor))}</span></div><p className="text-xs text-ink-muted tabular-nums">{quantity(r)} × {money(unitPrice(r))}{r.settledMinor?` · paid ${money(r.settledMinor)}`:''}</p>{line(r)}</div>)}</section>)}<div className="flex justify-between border-t border-outline-soft pt-3 font-bold"><span>Total {money(bill.original)}</span><span>Due {money(bill.due)}</span></div></div>
  </article>
  {error?<p role="alert" className="text-sm text-danger">{error}</p>:null}
  <section className="rounded-card border border-outline-soft bg-white p-4 md:p-5"><h2 className="font-bold">Activity</h2>
   <ol className="mt-2 divide-y divide-outline-soft">{events.map(e=><li key={e.id} className="grid grid-cols-[72px_1fr_auto] items-start gap-3 py-3 text-sm tabular-nums"><span className="text-ink-muted">{whenText(e.at)}</span><span className="min-w-0">{e.text}{e.amount?<strong className="ml-1">{money(e.amount)}</strong>:null}<span className="block text-xs text-ink-muted">{e.by}</span></span>{e.payment?<Button variant="ghost" fullWidth={false} className="!px-2 !py-1 text-sm" onClick={()=>onReceipt(e.payment!,false)}>Receipt</Button>:<span/>}</li>)}
    {events.filter(e=>!e.id.startsWith('patient_message:')).length<2?<li className="py-3 text-sm text-ink-muted">No payments yet.</li>:null}</ol></section>
  {canReceive?<div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 border-t border-outline-soft bg-white px-4 py-3 lg:hidden"><Button onClick={()=>setSheet('pay')}>Receive {money(bill.due)}</Button></div>:null}
  {sheet==='pay'?<ReceivePayment key={transfer?.id??'pay'} patientId={bill.patientId} chargeIds={chargeIds} data={data} transfer={transfer} onClose={()=>setSheet(undefined)} onReceipt={p=>{setSheet(undefined);onReceipt(p,true);}} onSaved={onSaved}/>:null}
  {sheet==='adjust'?<AdjustBill patientId={bill.patientId} chargeIds={chargeIds} data={data} onClose={()=>setSheet(undefined)} onSaved={onSaved} onOpenPatient={id=>{setSheet(undefined);onOpenPatient(id);}}/>:null}
  {sheet==='link'?<Sheet placement="side" title="Send to patient" eyebrow={`${patient?.fullName??bill.patientId} · ${bill.reference}`} onClose={()=>setSheet(undefined)}><PatientLinkPanel label="bill" patientId={bill.patientId} request={{kind:'bill',billKey:bill.id}}/></Sheet>:null}
  {sheet==='statement'?<PatientStatement patientId={bill.patientId} currencies={[bill.currency]} onClose={()=>setSheet(undefined)}/>:null}
  {sheet==='questions'?<Sheet placement="side" wide title="Billing questions" eyebrow={patient?.fullName??bill.patientId} onClose={()=>setSheet(undefined)}><BillingReviewList data={data} patientId={bill.patientId}/></Sheet>:null}
 </div>;
};
