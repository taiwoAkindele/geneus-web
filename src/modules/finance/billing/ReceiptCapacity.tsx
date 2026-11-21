import {useCallback,useEffect,useState} from 'react';
import {useAuthorizationContext} from '@/session';
import {useStaffVerification} from '@/modules/insurance/StaffVerification';
import {billingRequest} from '@/lib/api/billing';
import {useLiveQuery} from '@/data';
import {listIncomingTransfers} from '@/data/repos/billing';
import {formatMoney} from '@/lib/money';
import {userMessage} from '@/lib/api/userMessage';
import {Button,SelectField} from '@/ui';
type Capacity={id:string;patientMinor:number;payerMinor:number;availableMinor:number;overRecognizedMinor:number};
export const useReceiptCapacity=(ids:readonly string[],revision?:unknown)=>{
 const context=useAuthorizationContext(),{hasServerSession}=useStaffVerification(),key=[...new Set(ids)].sort().slice(0,200).join('|');
 const [sources,setSources]=useState<Record<string,Capacity>>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const refresh=useCallback(async()=>{if(!key||!hasServerSession){setSources({});return;}setBusy(true);setError('');try{const response=await billingRequest<{sources:Capacity[]}>(context,'transfers/capacity',{ids:key.split('|')});setSources(Object.fromEntries(response.sources.map(c=>[c.id,c])));}catch(e){setSources({});setError(userMessage(e,'Could not check how much of each transfer is left.'));}finally{setBusy(false);}},[key,hasServerSession,context.userId]);
 useEffect(()=>{void refresh();},[refresh,revision]);
 return {sources,error,busy,refresh,hasServerSession};
};
export const VerifiedReceiptPicker=({value,onChange,currency='NGN'}:{value:string;onChange:(id:string)=>void;currency?:string})=>{
 const query=useLiveQuery(listIncomingTransfers,['incoming_transfer','payment']);
 const receipts=(query.data??[]).filter(r=>r.mode==='live'&&r.currency===currency).slice(-200),capacity=useReceiptCapacity(receipts.map(r=>r.id));
 return <div className="space-y-2 rounded-field border border-outline-soft p-3"><SelectField label="Verified hospital bank receipt" value={value} onChange={e=>onChange(e.target.value)} options={[{value:'',label:'Choose the exact verified bank receipt'},...receipts.map(r=>({value:r.id,label:`${r.providerReference} · ${formatMoney(r.amountMinor,r.currency)} · ${capacity.sources[r.id]?formatMoney(capacity.sources[r.id].availableMinor,r.currency)+' available':'Capacity awaiting verification'}`}))]}/><p className="text-xs">The full remittance reserves this receipt, including unallocated insurer money. Patient collections share its remaining capacity.</p><Button variant="ghost" fullWidth={false} loading={capacity.busy} onClick={()=>void capacity.refresh()}>Refresh verified availability</Button>{capacity.error?<p role="alert">{capacity.error}</p>:null}{query.error?<p role="alert">Could not read verified receipts.</p>:null}</div>;
};
