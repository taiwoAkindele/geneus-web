import {StaffVerification,useStaffVerification} from '@/modules/insurance/StaffVerification';
import {useEffect,useState} from 'react';
import {useAuthorizationContext} from '@/session';
import {Button,SelectField,TextField} from '@/ui';
import {billingRequest,type BillingConnection} from '@/lib/api/billing';

type Account={providerAccountId:string;accountNumber:string;accountName:string;bankName:string};
export const BillingSettings=()=>{
 const context=useAuthorizationContext(),{hasServerSession}=useStaffVerification();
 const [connection,setConnection]=useState<BillingConnection>(),[secret,setSecret]=useState(''),[phone,setPhone]=useState(''),[accounts,setAccounts]=useState<Account[]>([]),[provider,setProvider]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const allowed=context.permissions.includes('fee_item:manage');
 const refresh=async()=>setConnection(await billingRequest<BillingConnection>(context,'connection/status',{}));
 const perform=async(action:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await action();}catch(e){setError(e instanceof Error?e.message:'Could not save payment settings');}finally{setBusy(false);}};
 useEffect(()=>{document.title='Payment settings · Geneus Health';if(allowed&&hasServerSession)void perform(refresh);},[allowed,hasServerSession,context.userId]);
 return <div className="mx-auto max-w-3xl space-y-5 px-5 pb-24 pt-4">
 {!allowed?<p>Your account cannot configure billing.</p>:!hasServerSession?<StaffVerification requireServerSession purpose="Configuring payment collection"/>:<>
 <h1 className="text-xl font-bold">Payment settings</h1><p>Connect the hospital provider and select one general receiving account for all service points.</p>
 <section className="space-y-3 rounded-card border border-outline-soft bg-white p-4"><h2 className="text-lg font-bold">Hospital Paystack connection</h2>
 <p>{connection?connection.configured?`Connected · ${connection.mode} mode`:'Not connected':'Reading connection…'}</p>
 {connection&&!connection.encryptionReady?<p>Ask your server administrator to enable encrypted provider credentials.</p>:null}
 <TextField label="Paystack secret key" type="password" autoComplete="new-password" value={secret} onChange={e=>setSecret(e.target.value)}/>
 <p className="text-xs text-ink-muted">Stored encrypted on the server. Never stored in this device's database.</p>
 <Button disabled={busy||!secret||!connection?.encryptionReady} onClick={()=>void perform(async()=>{try{await billingRequest(context,'connection',{secretKey:secret});await refresh();setAccounts([]);setNotice('Provider connected.');}finally{setSecret('');}})}>Connect Paystack</Button>
 {connection?.webhookPath?<div><p className="text-sm">Set the Paystack webhook to your public backend URL followed by:</p><p className="break-all font-mono text-xs">{connection.webhookPath}</p></div>:null}</section>
 <section className="space-y-3 rounded-card border border-outline-soft bg-white p-4"><h2 className="text-lg font-bold">General receiving account</h2>
 <p className="text-sm">Create a hospital payment point or link an existing Paystack receiving account. A settlement account alone does not supply verified incoming transfers.</p>
 <TextField label="Hospital WhatsApp notification number" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+2348012345678" inputMode="tel"/>
 <Button disabled={busy||!connection?.configured||!phone} onClick={()=>void perform(async()=>{await billingRequest(context,'accounts/create-terminal',{notificationPhone:phone});await refresh();setNotice('Hospital receiving account created.');})}>Create hospital payment point</Button>
 <Button variant="outlined" disabled={busy||!connection?.configured} onClick={()=>void perform(async()=>{const found=await billingRequest<Account[]>(context,'accounts/discover',{});setAccounts(found);setNotice(found.length?'Choose a receiving account.':'No active NGN receiving accounts found.');})}>Find receiving accounts</Button>
 {accounts.length?<SelectField label="Existing receiving account" value={provider} onChange={e=>setProvider(e.target.value)} options={[{value:'',label:'Choose account'},...accounts.map(a=>({value:a.providerAccountId,label:`${a.bankName} · ${a.accountNumber} · ${a.accountName}`}))]}/>:null}
 <TextField label="Or existing Paystack terminal code" value={code} onChange={e=>setCode(e.target.value)} placeholder="VT_…"/>
 <Button variant="outlined" disabled={busy||!connection?.configured||(!provider&&!code.trim())} onClick={()=>void perform(async()=>{await billingRequest(context,'accounts/link',{providerAccountId:code.trim()||provider});await refresh();setProvider('');setCode('');setNotice('Account linked.');})}>Link receiving account</Button>
 {connection?.accounts.map(a=><article key={a.id} className="space-y-2 rounded-field border border-outline-soft p-3"><h3 className="font-bold">{connection.receivingAccountId===a.id?'General hospital account':a.departmentId?'Legacy departmental account':'Linked account'} · {a.mode}</h3><p>{a.bankName} · {a.accountName}</p><p className="font-mono">{a.accountNumber}</p>{a.departmentId?<p className="text-xs">Recorded department retained for historical reconciliation.</p>:null}{a.mode===connection.mode&&connection.receivingAccountId!==a.id?<Button variant="outlined" disabled={busy} onClick={()=>void perform(async()=>{await billingRequest(context,'accounts/general',{accountId:a.id});await refresh();setNotice('General account selected. Earlier receipts keep their original account history.');})}>Use for hospital collections</Button>:null}</article>)}
 </section>{error?<div role="alert">{error}<Button variant="ghost" onClick={()=>void perform(refresh)}>Refresh settings</Button></div>:null}{notice?<p role="status">{notice}</p>:null}
 </>}
 </div>;
};
