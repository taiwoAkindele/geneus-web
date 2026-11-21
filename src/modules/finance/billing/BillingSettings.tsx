import {StaffVerification,useStaffVerification} from '@/modules/insurance/StaffVerification';
import {useEffect,useState,type ReactNode} from 'react';
import {useAuthorizationContext} from '@/session';
import {Button,SelectField,TextField,useToast} from '@/ui';
import {billingRequest,type BillingConnection} from '@/lib/api/billing';
import {userMessage} from '@/lib/api/userMessage';
import {internationalPhone} from './phone';

type Account={providerAccountId:string;accountNumber:string;accountName:string;bankName:string};

const Step=({n,done,title,status,children}:{n:number;done:boolean;title:string;status:string;children?:ReactNode})=>
 <section className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
  <div className="flex items-start gap-3"><span aria-hidden className={`grid h-7 w-7 flex-none place-items-center rounded-full text-sm font-extrabold ${done?'bg-brand text-white':'border-2 border-outline text-ink-soft'}`}>{done?'✓':n}</span><div><h2 className="text-lg font-bold">{title}</h2><p className="text-sm text-ink-muted">{status}</p></div></div>
  {children?<div className="space-y-3 pl-10">{children}</div>:null}
 </section>;

/**
 * Settings → Billing: bank transfer collection. Cash needs none of this.
 * Step 1 connects the hospital's Paystack account; step 2 chooses where patients' transfers arrive.
 * The server stores the key encrypted and checks every change. Every change reports its result as a toast.
 */
export const BillingSettings=()=>{
 const context=useAuthorizationContext(),{hasServerSession}=useStaffVerification(),toast=useToast();
 const [connection,setConnection]=useState<BillingConnection>(),[secret,setSecret]=useState(''),[changeKey,setChangeKey]=useState(false),[phone,setPhone]=useState(''),[phoneTouched,setPhoneTouched]=useState(false),[accounts,setAccounts]=useState<Account[]>([]),[provider,setProvider]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const allowed=context.permissions.includes('fee_item:manage');
 const refresh=async()=>setConnection(await billingRequest<BillingConnection>(context,'connection/status',{}));
 /** Runs one change: success and failure are both toasted, and a failure also stays on the page until the next attempt. */
 const perform=async(action:()=>Promise<string|undefined|void>,fallback:string)=>{
  if(busy)return;setBusy(true);setError('');
  try{const done=await action();if(done)toast(done);}
  catch(e){const message=userMessage(e,fallback);setError(message);toast(message,{tone:'error'});}
  finally{setBusy(false);}
 };
 const reload=()=>perform(refresh,'Billing settings could not be read. Try again.');
 useEffect(()=>{document.title='Billing settings · Geneus Health';if(allowed&&hasServerSession)void reload();},[allowed,hasServerSession,context.userId]);
 const alertNumber=internationalPhone(phone);
 const general=connection?.accounts.find(a=>a.id===connection.receivingAccountId);
 const others=connection?.accounts.filter(a=>a.id!==connection.receivingAccountId)??[];
 return <div className="max-w-3xl space-y-4">
  <div><h2 className="text-xl font-bold">Bank transfers</h2><p className="text-sm text-ink-muted">Let patients pay by bank transfer. Cash works without any of this.</p></div>
  {!allowed?<p>Your account can't change billing settings.</p>:!hasServerSession?<StaffVerification requireServerSession purpose="Configuring payment collection"/>:!connection?<p role="status">{error?'Settings could not be read.':'Reading settings…'}</p>:<>
  <Step n={1} done={connection.configured} title="Connect Paystack" status={connection.configured?`Connected · ${connection.mode} mode`:'Not connected'}>
   {!connection.encryptionReady?<p className="text-sm">The server can't store payment keys safely yet. Ask your system administrator to finish the server's payment setup.</p>
    :!connection.configured||changeKey?<><TextField label="Paystack secret key" type="password" autoComplete="new-password" value={secret} onChange={e=>setSecret(e.target.value)}/><p className="text-xs text-ink-muted">Stored encrypted on the server, never on this device.</p>
     <div className="flex flex-wrap gap-2"><Button fullWidth={false} loading={busy} disabled={!secret} onClick={()=>void perform(async()=>{try{await billingRequest(context,'connection',{secretKey:secret});await refresh();setAccounts([]);setChangeKey(false);return 'Paystack connected.';}finally{setSecret('');}},'Paystack could not be connected. Check the secret key and try again.')}>Connect</Button>{changeKey?<Button variant="outlined" fullWidth={false} onClick={()=>{setChangeKey(false);setSecret('');}}>Cancel</Button>:null}</div></>
    :<Button variant="ghost" fullWidth={false} className="!px-0 !py-2" onClick={()=>setChangeKey(true)}>Change key</Button>}
  </Step>
  <Step n={2} done={Boolean(general)} title="Choose where transfers arrive" status={general?`${general.bankName} · ${general.accountNumber} · ${general.accountName}`:connection.configured?'No receiving account chosen':'Available after step 1'}>
   {connection.configured&&!general?<>
    <p className="text-sm">Create a hospital receiving account in Paystack. Patients transfer to it, and Geneus verifies each transfer.</p>
    <TextField label="WhatsApp number for payment alerts" value={phone} onChange={e=>setPhone(e.target.value)} onBlur={()=>setPhoneTouched(true)} placeholder="0803 123 4567" inputMode="tel" autoComplete="tel"
     error={phoneTouched&&phone.trim()&&!alertNumber?'Enter a phone number, like 0803 123 4567 or +234 803 123 4567.':undefined}/>
    <p className="text-xs text-ink-muted">Paystack sends a WhatsApp alert to this number for each payment, so use a phone someone at the hospital checks. Geneus doesn't need it.{alertNumber&&alertNumber!==phone.trim()?` It will be saved as ${alertNumber}.`:''}</p>
    <Button fullWidth={false} loading={busy} disabled={!alertNumber} onClick={()=>void perform(async()=>{await billingRequest(context,'accounts/create-terminal',{notificationPhone:alertNumber});await refresh();return 'Receiving account created.';},'The receiving account could not be created. Check the number and try again.')}>Create receiving account</Button>
   </>:null}
   {connection.configured?<details className="text-sm"><summary className="min-h-[44px] cursor-pointer py-3 font-semibold">Advanced</summary><div className="space-y-3">
    <p>Use an account that already exists in Paystack instead.</p>
    <Button variant="outlined" fullWidth={false} loading={busy} onClick={()=>void perform(async()=>{const found=await billingRequest<Account[]>(context,'accounts/discover',{});setAccounts(found);return found.length?`${found.length} ${found.length===1?'account':'accounts'} found. Choose one below.`:'No active NGN receiving accounts were found in Paystack.';},'Existing accounts could not be read from Paystack. Try again.')}>Find existing accounts</Button>
    {accounts.length?<SelectField label="Existing receiving account" value={provider} onChange={e=>setProvider(e.target.value)} options={[{value:'',label:'Choose account'},...accounts.map(a=>({value:a.providerAccountId,label:`${a.bankName} · ${a.accountNumber} · ${a.accountName}`}))]}/>:null}
    <TextField label="Or a Paystack terminal code" value={code} onChange={e=>setCode(e.target.value)} placeholder="VT_…"/>
    <Button variant="outlined" fullWidth={false} loading={busy} disabled={!(provider||code.trim())} onClick={()=>void perform(async()=>{await billingRequest(context,'accounts/link',{providerAccountId:code.trim()||provider});await refresh();setProvider('');setCode('');return 'Account linked.';},'The account could not be linked. Check the code and try again.')}>Link account</Button>
    {others.map(a=><article key={a.id} className="space-y-1 rounded-field border border-outline-soft p-3"><p className="font-semibold">{a.departmentId?'Earlier department account':'Linked account'} · {a.mode}</p><p>{a.bankName} · {a.accountName} · <span className="font-mono">{a.accountNumber}</span></p>{a.departmentId?<p className="text-xs text-ink-muted">Kept so earlier transfers still reconcile.</p>:null}{a.mode===connection.mode?<Button variant="outlined" fullWidth={false} loading={busy} onClick={()=>void perform(async()=>{await billingRequest(context,'accounts/general',{accountId:a.id});await refresh();return 'Receiving account changed. Earlier transfers keep their original account.';},'The receiving account could not be changed. Try again.')}>Use for hospital transfers</Button>:null}</article>)}
    {connection.webhookPath?<div><p>Paystack webhook: your public server address followed by</p><p className="break-all font-mono text-xs">{connection.webhookPath}</p></div>:null}
   </div></details>:null}
  </Step>
  </>}
  {error?<div role="alert" className="space-y-2 rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger"><p>{error}</p><Button variant="ghost" fullWidth={false} onClick={()=>void reload()}>Reload settings</Button></div>:null}
 </div>;
};
