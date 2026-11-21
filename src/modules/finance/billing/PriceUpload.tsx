import {useRef,useState} from 'react';
import type {FeeItem} from '@shared';
import {useAuthorizationContext} from '@/session';
import {Button,Sheet} from '@/ui';
import {StaffVerification} from '@/modules/insurance/StaffVerification';
import {saveConfiguration,type ConfigurationWrite} from '@/data/configurationSave';
import {downloadCsv} from '@/lib/csv';
import {previewPrices,preparePriceWrites,type PriceImportRow} from './priceImport';
import {CATEGORY_LABELS} from './feeForm';

export const PriceUpload=({fees,currency,onClose,onSaved}:{fees:FeeItem[];currency:string;onClose:()=>void;onSaved:()=>void})=>{
  const context=useAuthorizationContext(),[rows,setRows]=useState<PriceImportRow[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const writes=useRef<ConfigurationWrite[]>(),saving=useRef(false);
  const read=async(file?:File)=>{if(!file)return;setError('');setNotice('');setRows([]);writes.current=undefined;setBusy(true);
    try{if(file.size>4*1024*1024)throw new Error('Use a file smaller than 4 MB');if(!/\.(csv|xlsx)$/i.test(file.name))throw new Error('Choose a CSV or Excel (.xlsx) file');
      const XLSX=await import('xlsx'),book=XLSX.read(await file.arrayBuffer(),{type:'array',cellFormula:true});
      if(book.SheetNames.length!==1)throw new Error('Use one worksheet per upload');const sheet=book.Sheets[book.SheetNames[0]];
      if(Object.values(sheet).some(cell=>cell&&typeof cell==='object'&&'f' in cell))throw new Error('Replace spreadsheet formulas with values before uploading');
      const result=previewPrices(XLSX.utils.sheet_to_json<unknown[]>(sheet,{header:1,raw:false,defval:''}),fees,currency);if(!result.length)throw new Error('No items found');setRows(result);
    }catch(e){setError(e instanceof Error?e.message:'Could not read file');}finally{setBusy(false);}};
  const save=async()=>{if(saving.current)return;saving.current=true;setBusy(true);setError('');
    try{writes.current??=preparePriceWrites(rows,context,currency);const result=await saveConfiguration(context,writes.current,{billingImport:true});setNotice(result.arrived?'Prices imported.':'Saved on the server. Prices will appear on this device after synchronization.');setRows([]);onSaved();}
    catch(e){setError(e instanceof Error?e.message:'Import failed');}finally{setBusy(false);saving.current=false;}};
  return <Sheet title="Upload prices" eyebrow="Price Catalogue" onClose={onClose} closeDisabled={busy} hasUnsavedChanges={Boolean(rows.length)} placement="side"><div className="space-y-4">
    <p>Upload CSV or Excel. Three required columns: Name, Category, Price. Description is optional. Prices use {currency}.</p>
    <Button variant="outlined" disabled={busy} onClick={()=>downloadCsv('billing-price-template.csv',[['Name','Category','Price','Description','Item ID'],['Full Blood Count','Laboratory','5000','','']])}>Download template</Button>
    <p className="text-sm text-ink-muted">Up to 500 items. New items charge only when selected. To update an existing price, include its exact Item ID, name and category. Automatic charging and exemptions stay unchanged.</p>
    <label className="block space-y-2 font-bold">Choose price file<input className="block w-full rounded-field border border-outline p-3 text-sm" type="file" accept=".csv,.xlsx" disabled={busy} onChange={e=>void read(e.target.files?.[0])}/></label>
    {rows.length?<><h2 className="font-bold">Preview · {rows.length} items · {rows.filter(r=>r.error).length} errors</h2><div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Row</th><th>Item / category</th><th>Price</th><th>Action</th></tr></thead><tbody>{rows.map(r=><tr key={r.line} className="border-t border-outline-soft"><td className="p-2">{r.line}</td><td className="p-2">{r.name}<p>{CATEGORY_LABELS[r.category as keyof typeof CATEGORY_LABELS]??r.category}</p>{r.error?<p className="text-danger">{r.error}</p>:null}</td><td className="p-2">{r.price}</td><td className="p-2">{r.fee?'Update price':'New item'}</td></tr>)}</tbody></table></div><StaffVerification requireServerSession purpose="Importing billing prices"><Button loading={busy} disabled={rows.some(r=>Boolean(r.error))} onClick={()=>void save()}>Import {rows.length} prices</Button></StaffVerification></>:null}
    {error?<p role="alert" className="rounded-field bg-danger-bg p-3 text-danger">{error}</p>:null}{notice?<p role="status" className="rounded-field bg-brand-wash p-3">{notice}</p>:null}
  </div></Sheet>;
};
