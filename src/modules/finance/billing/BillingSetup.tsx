import {useSearchParams,Link} from 'react-router-dom';
import {Button} from '@/ui';
import {useAuthorizationContext} from '@/session';
import {FeeSettings} from './FeeSettings';
import {BillingSettings} from './BillingSettings';
import {useBilling} from './useBilling';

/** A guide over existing settings, without a second setup state or activation gate. */
export const BillingSetup=()=>{
 const [params,setParams]=useSearchParams(),context=useAuthorizationContext(),query=useBilling();
 const step=Math.min(3,Math.max(1,Number(params.get('step'))||1));
 if(!context.permissions.includes('fee_item:manage'))return <p className="p-5">Billing setup requires catalogue management permission.</p>;
 return <div className="mx-auto max-w-6xl space-y-5 px-4 py-5"><header><p className="text-sm font-bold text-brand">BILLING SETUP</p><h1 className="mt-2 text-2xl font-extrabold">Ready to collect, in three steps</h1><p className="mt-2 text-ink-muted">Add hospital prices, choose how to receive payments, then review.</p></header>
 <nav aria-label="Billing setup steps" className="grid grid-cols-3 gap-2">{['Prices','Collections','Review'].map((label,i)=><button type="button" key={label} aria-current={step===i+1?'step':undefined} className={`min-h-[48px] rounded-card border p-3 text-left font-bold ${step===i+1?'border-brand bg-brand-wash text-brand':'border-outline-soft bg-white'}`} onClick={()=>setParams({step:String(i+1)})}>{i+1}. {label}</button>)}</nav>
 {step===1?<><p>Start with a CSV or Excel price list, or add one item at a time. New items charge only when selected.</p><FeeSettings/></>:step===2?<><section className="rounded-card border border-brand-tint bg-brand-wash p-4"><h2 className="font-bold">Cash is available offline</h2><p className="mt-1 text-sm">No bank connection is needed for cash collection. Configure the general hospital account below if you also accept verified bank transfers.</p></section><BillingSettings/></>:<section className="space-y-4 rounded-card border border-outline-soft bg-white p-5"><h2 className="text-xl font-bold">Review your billing setup</h2>{query.error?<p role="alert">Could not read prices. Return to Prices and try again.</p>:query.loading?<p role="status">Reading prices…</p>:<p className="text-lg font-bold">{query.data?.fees.filter(f=>f.active).length??0} active catalogue items on this device</p>}<p>New prices appear in their relevant modules after synchronization. Clinical templates, stock details and documentation are configured separately.</p><p>Existing automatic registration and visit fees retain their policies. New items require explicit selection. Existing bills keep their original price.</p><Link className="inline-flex min-h-[44px] items-center font-bold text-brand" to="/billing/settings/payments">Review provider and general receiving account</Link><p className="text-sm text-ink-muted">Provider verification and receipt availability require a connection. There is no additional activation step for manual billing.</p><Link className="inline-flex min-h-[44px] items-center rounded-field bg-brand px-5 font-bold text-white" to="/billing">Open billing</Link></section>}
 <footer className="flex justify-between gap-3">{step>1?<Button fullWidth={false} variant="outlined" onClick={()=>setParams({step:String(step-1)})}>Back</Button>:<span/>}{step<3?<Button fullWidth={false} onClick={()=>setParams({step:String(step+1)})}>Continue to {step===1?'Collections':'Review'}</Button>:null}</footer>
 </div>;
};
