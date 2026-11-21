import {StaffVerification,useStaffVerification} from '@/modules/insurance/StaffVerification';
import {useEffect,useState,type ReactNode} from 'react';
import {useAuthorizationContext} from '@/session';
import {Button,SelectField,TextField} from '@/ui';
import {billingRequest,type BillingConnection} from '@/lib/api/billing';

type Account={providerAccountId:string;accountNumber:string;accountName:string;bankName:string};

const Step=({n,done,title,status,children}:{n:number;done:boolean;title:string;status:string;children?:ReactNode})=>
 <section className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
  <div className="flex items-start gap-3"><span aria-hidden className={`grid h-7 w-7 flex-none place-items-center rounded-full text-sm font-extrabold ${done?'bg-brand text-white':'border-2 border-outline text-ink-soft'}`}>{done?'✓':n}</span><div><h2 className="text-lg font-bold">{title}</h2><p className="text-sm text-ink-muted">{status}</p></div></div>
  {children?<div className="space-y-3 pl-10">{children}</div>:null}
 </section>;

/**
 * Settings → Billing: bank transfer collection. Cash needs none of this.
 * Step 1 connects the hospital's Paystack account; step 2 chooses where patients' transfers arrive.
 * The server stores the key encrypted and checks every change.
 */
export const BillingSettings=()=>{
 const context=useAuthorizationContext(),{hasServerSession}=useStaffVerification();
 const [connection,setConnection]=useState<BillingConnection>(),[secret,setSecret]=useState(''),[changeKey,setChangeKey]=useState(false),[phone,setPhone]=useState(''),[accounts,setAccounts]=useState<Account[]>([]),[provider,setProvider]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const allowed=context.permissions.includes('fee_item:manage');
 const refresh=async()=>setConnection(await billingRequest<BillingConnection>(context,'connection/status',{}));
 const perform=async(action:()=>Promise<unknown>)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await action();}catch(e){setError(e instanceof Error?e.message:'Could not save payment settings');}finally{setBusy(false);}};
 useEffect(()=>{document.title='Billing settings · Geneus Health';if(allowed&&hasServerSession)void perform(refresh);},[allowed,hasServerSession,context.userId]);
 const general=connection?.accounts.find(a=>a.id===connection.receivingAccountId);
 const others=connection?.accounts.filter(a=>a.id!==connection.receivingAccountId)??[];
 return <div className="max-w-3xl space-y-4">
  <div><h2 className="text-xl font-bold">Bank transfers</h2><p className="text-sm text-ink-muted">Let patients pay by bank transfer. Cash works without any of this.</p></div>
  {!allowed?<p>Your account can't change billing settings.</p>:!hasServerSession?<StaffVerification requireServerSession purpose="Configuring payment collection"/>:!connection?<p role="status">{error?'Settings could not be read.':'Reading settings…'}</p>:<>
  <Step n={1} done={connection.configured} title="Connect Paystack" status={connection.configured?`Connected · ${connection.mode} mode`:'Not connected'}>
   {!connection.encryptionReady?<p className="text-sm">The server can't store the key safely yet. Ask your server administrator to enable encrypted provider credentials.</p>
    :!connection.configured||changeKey?<><TextField label="Paystack secret key" type="password" autoComplete="new-password" value={secret} onChange={e=>setSecret(e.target.value)}/><p className="text-xs text-ink-muted">Stored encrypted on the server, never on this device.</p>
     <div className="flex flex-wrap gap-2">{secret?<Button fullWidth={false} loading={busy} onClick={()=>void perform(async()=>{try{await billingRequest(context,'connection',{secretKey:secret});await refresh();setAccounts([]);setChangeKey(false);setNotice('Paystack connected.');}finally{setSecret('');}})}>Connect</Button>:null}{changeKey?<Button variant="outlined" fullWidth={false} onClick={()=>{setChangeKey(false);setSecret('');}}>Cancel</Button>:null}</div></>
    :<Button variant="ghost" fullWidth={false} className="!px-0 !py-2" onClick={()=>setChangeKey(true)}>Change key</Button>}
  </Step>
  <Step n={2} done={Boolean(general)} title="Choose where transfers arrive" status={general?`${general.bankName} · ${general.accountNumber} · ${general.accountName}`:connection.configured?'No receiving account chosen':'Available after step 1'}>
   {connection.configured&&!general?<>
    <p className="text-sm">Create a hospital receiving account in Paystack. Patients transfer to it, and Geneus verifies each transfer.</p>
    <TextField label="Hospital WhatsApp number for payment alerts" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+2348012345678" inputMode="tel"/>
    {phone?<Button fullWidth={false} loading={busy} onClick={()=>void perform(async()=>{await billingRequest(context,'accounts/create-terminal',{notificationPhone:phone});await refresh();setNotice('Hospital receiving account created.');})}>Create receiving account</Button>:null}
   </>:null}
   {connection.configured?<details className="text-sm"><summary className="min-h-[44px] cursor-pointer py-3 font-semibold">Advanced</summary><div className="space-y-3">
    <p>Use an account that already exists in Paystack instead.</p>
    <Button variant="outlined" fullWidth={false} loading={busy} onClick={()=>void perform(async()=>{const found=await billingRequest<Account[]>(context,'accounts/discover',{});setAccounts(found);setNotice(found.length?'Choose a receiving account.':'No active NGN receiving accounts found.');})}>Find existing accounts</Button>
    {accounts.length?<SelectField label="Existing receiving account" value={provider} onChange={e=>setProvider(e.target.value)} options={[{value:'',label:'Choose account'},...accounts.map(a=>({value:a.providerAccountId,label:`${a.bankName} · ${a.accountNumber} · ${a.accountName}`}))]}/>:null}
    <TextField label="Or a Paystack terminal code" value={code} onChange={e=>setCode(e.target.value)} placeholder="VT_…"/>
    {provider||code.trim()?<Button variant="outlined" fullWidth={false} loading={busy} onClick={()=>void perform(async()=>{await billingRequest(context,'accounts/link',{providerAccountId:code.trim()||provider});await refresh();setProvider('');setCode('');setNotice('Account linked. Choose it below to receive hospital transfers.');})}>Link account</Button>:null}
    {others.map(a=><article key={a.id} className="space-y-1 rounded-field border border-outline-soft p-3"><p className="font-semibold">{a.departmentId?'Earlier department account':'Linked account'} · {a.mode}</p><p>{a.bankName} · {a.accountName} · <span className="font-mono">{a.accountNumber}</span></p>{a.departmentId?<p className="text-xs text-ink-muted">Kept so earlier transfers still reconcile.</p>:null}{a.mode===connection.mode?<Button variant="outlined" fullWidth={false} loading={busy} onClick={()=>void perform(async()=>{await billingRequest(context,'accounts/general',{accountId:a.id});await refresh();setNotice('Receiving account changed. Earlier transfers keep their original account.');})}>Use for hospital transfers</Button>:null}</article>)}
    {connection.webhookPath?<div><p>Paystack webhook: your public server address followed by</p><p className="break-all font-mono text-xs">{connection.webhookPath}</p></div>:null}
   </div></details>:null}
  </Step>
  </>}
  {error?<div role="alert" className="space-y-2 rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger"><p>{error}</p><Button variant="ghost" fullWidth={false} onClick={()=>void perform(refresh)}>Try again</Button></div>:null}
  {notice?<p role="status" className="rounded-field bg-brand-wash p-3 text-sm text-brand">{notice}</p>:null}
 </div>;
};
