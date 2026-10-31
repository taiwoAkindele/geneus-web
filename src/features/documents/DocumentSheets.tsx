import { useState } from 'react';
import { DOCUMENT_ACCEPT,DOCUMENT_SIGNATURE_LABELS,SignatureReview as SignatureSchema,type Encounter,type LibraryDocument,type VisitDocument,type InpatientEvent,type DocumentSignatureStatus,type SignatureReview } from '@shared';
import { Button,SelectField,Sheet,SheetCancelButton,TextAreaField,TextField } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { uploadLibraryDocument,changeLibraryDocument,attachVisitDocument,updateVisitDocument,type ClinicalDocumentsData } from '@/data/repos/clinicalDocuments';
export type LibraryTask={action:LibraryDocument['action'];record?:LibraryDocument};
export const LibraryDocumentSheet=({task,onClose,onSaved}:{task:LibraryTask;onClose:()=>void;onSaved:()=>void})=>{
  const context=useAuthorizationContext(),[title,setTitle]=useState(task.record?.title??''),[file,setFile]=useState<File>(),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const needsFile=task.action==='upload'||task.action==='replace';
  const label={upload:'Upload document',replace:'Replace library file',rename:'Rename document',archive:'Archive document',restore:'Restore document'}[task.action];
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();if(needsFile&&!file){setError('Choose a file');return;}setSaving(true);setError('');
    try{if(task.action==='upload')await uploadLibraryDocument(title,file!,context);else if(task.record)await changeLibraryDocument(task.record,task.action,context,file,title);onSaved();}
    catch(cause){setError(cause instanceof Error?cause.message:'The document could not be saved');}finally{setSaving(false);}
  };
  return <Sheet title={label} eyebrow="Hospital document library" onClose={onClose} closeDisabled={saving} hasUnsavedChanges={Boolean(file||title!==(task.record?.title??''))} placement="side"><form onSubmit={save} className="space-y-5">
    {needsFile?<TextField type="file" label="Document file" accept={DOCUMENT_ACCEPT} required onChange={event=>{const next=event.target.files?.[0];setFile(next);if(next&&!title)setTitle(next.name.replace(/\.[^.]+$/,''));}} hint="PDF, JPEG, PNG or WebP · up to 10 MB"/>:null}
    {['upload','replace','rename'].includes(task.action)?<TextField label="Document name" required maxLength={160} value={title} onChange={event=>setTitle(event.target.value)}/>:<p className="font-bold">{title}</p>}
    {task.action==='replace'?<p className="text-sm text-ink-soft">This creates a new library version. Copies already linked to visits retain their issued version.</p>:null}
    {task.action==='archive'?<p className="text-sm text-ink-soft">The document will leave the active library. Its history and existing visit copies remain available.</p>:null}
    {needsFile?<p className="text-sm text-ink-soft">The file is saved securely on this device first, then uploaded when connected.</p>:null}
    {error?<p role="alert" className="text-sm text-danger">{error}</p>:null}<Button type="submit" disabled={saving}>{saving?'Saving…':label}</Button><SheetCancelButton disabled={saving}/>
  </form></Sheet>;
};

type ReviewForm={signerName:string;signerKind:SignatureReview['signerKind'];relationship:string;authorityBasis:string;signedOn:string;note:string};
const emptyReview:ReviewForm={signerName:'',signerKind:'patient',relationship:'',authorityBasis:'',signedOn:'',note:''};
const signature=(form:ReviewForm)=>SignatureSchema.parse({...form,relationship:form.relationship.trim()||undefined,authorityBasis:form.authorityBasis.trim()||undefined,signedOn:form.signedOn||undefined,note:form.note.trim()||undefined});
export type VisitDocumentTask={action:'attach'|'signed_copy'|'status';record?:VisitDocument};
export const VisitDocumentSheet=({task,admission,visit,data,patientName,onClose,onSaved}:{task:VisitDocumentTask;admission:InpatientEvent;visit:Encounter;data:ClinicalDocumentsData;patientName:string;onClose:()=>void;onSaved:()=>void})=>{
  const context=useAuthorizationContext();
  const [source,setSource]=useState<'library'|'upload'>('library'),[templateId,setTemplateId]=useState(''),[file,setFile]=useState<File>(),[title,setTitle]=useState(task.record?.title??'');
  const [status,setStatus]=useState<DocumentSignatureStatus>(task.action==='signed_copy'?'signed':task.record?.signatureStatus??'unsigned');
  const [review,setReview]=useState<ReviewForm>({...emptyReview,...task.record?.signatureReview,relationship:task.record?.signatureReview?.relationship??'',authorityBasis:task.record?.signatureReview?.authorityBasis??'',signedOn:task.record?.signatureReview?.signedOn??'',note:task.record?.signatureReview?.note??''});
  const [verified,setVerified]=useState(false),[reason,setReason]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const templates=data.libraryHeads.filter(record=>!record.archived&&data.libraryHeads.filter(other=>other.documentId===record.documentId).length===1);
  const template=templates.find(record=>record.id===templateId);
  const label=task.action==='attach'?'Add visit document':task.action==='signed_copy'?'Upload signed copy':'Review signature status';
  const requiresFile=task.action==='signed_copy'||(task.action==='attach'&&source==='upload');
  const sourceTemplate=data.library.find(record=>record.id===task.record?.templateVersionId);
  const canMarkSigned=task.action==='signed_copy'||(task.action==='attach'?source==='upload':!sourceTemplate||task.record?.file.id!==sourceTemplate.file.id);
  const setReviewField=(key:keyof ReviewForm,value:string)=>setReview(current=>({...current,[key]:value}));
  const save=async(event:React.FormEvent)=>{
    event.preventDefault();setError('');
    if(requiresFile&&!file){setError('Choose the patient-specific file');return;}
    if(status==='signed'&&!verified){setError('Confirm that you checked the signature evidence');return;}
    setSaving(true);
    try{
      const signatureReview=status==='signed'?signature(review):undefined;
      if(task.action==='attach')await attachVisitDocument({admission,title,template:source==='library'?template:undefined,input:source==='upload'?file:undefined,signatureStatus:status,signatureReview},context);
      else if(task.record)await updateVisitDocument(task.record,context,{admission,input:task.action==='signed_copy'?file:undefined,signatureStatus:status,signatureReview,changeReason:reason});
      onSaved();
    }catch(cause){setError(cause instanceof Error?cause.message:'The visit document could not be saved');}finally{setSaving(false);}
  };
  return <Sheet title={label} eyebrow={patientName} onClose={onClose} closeDisabled={saving} hasUnsavedChanges={Boolean(file||templateId||reason||review.signerName||status!==task.record?.signatureStatus)} placement="side"><form onSubmit={save} className="space-y-5">
    <div className="rounded-field bg-brand-wash p-4"><p className="break-all font-mono text-sm">{admission.patientId}</p><p className="mt-1 text-sm">Visit: {new Date(visit.openedOn).toLocaleDateString('en-GB')}</p><p className="mt-1 text-sm">{[data.inpatient.locations.find(place=>place.id===admission.wardId)?.name,data.inpatient.locations.find(place=>place.id===admission.bedId)?.name].filter(Boolean).join(' · ')||'Awaiting bed'}</p></div>
    {task.action==='attach'?<><SelectField label="Document source" value={source} onChange={event=>{setSource(event.target.value as 'library'|'upload');if(status==='signed')setStatus('unsigned');}} options={[{value:'library',label:'From hospital library'},{value:'upload',label:'Upload patient-specific file'}]}/>
      {source==='library'?<SelectField label="Library document" required value={templateId} onChange={event=>{setTemplateId(event.target.value);const next=templates.find(record=>record.id===event.target.value);if(next)setTitle(next.title);}} options={[{value:'',label:'Choose a library document'},...templates.map(record=>({value:record.id,label:`${record.title} · v${record.version}`}))]}/>:null}</>:null}
    {requiresFile?<TextField label={task.action==='signed_copy'?'Signed copy file':'Patient document file'} type="file" accept={DOCUMENT_ACCEPT} required onChange={event=>{const next=event.target.files?.[0];setFile(next);if(next&&!title)setTitle(next.name.replace(/\.[^.]+$/,''));}} hint="PDF, JPEG, PNG or WebP · up to 10 MB"/>:null}
    {task.action==='attach'?<TextField label="Document name" value={title} onChange={event=>setTitle(event.target.value)} required maxLength={160}/>:<p className="font-bold">{title}</p>}
    <SelectField label="Signature status" required disabled={task.action==='signed_copy'} value={status} onChange={event=>setStatus(event.target.value as DocumentSignatureStatus)} options={(Object.entries(DOCUMENT_SIGNATURE_LABELS) as [DocumentSignatureStatus,string][]).filter(([value])=>value!=='signed'||canMarkSigned).map(([value,label])=>({value,label}))}/>
    {status==='signed'?<><SelectField label="Who signed" value={review.signerKind} onChange={event=>setReviewField('signerKind',event.target.value)} options={[{value:'patient',label:'Patient'},{value:'representative',label:'Authorised representative / guardian'},{value:'staff',label:'Hospital staff'}]}/>
      <TextField label="Signer’s name" required value={review.signerName} onChange={event=>setReviewField('signerName',event.target.value)} maxLength={160}/>
      {review.signerKind==='representative'?<><TextField label="Relationship to patient" required value={review.relationship} onChange={event=>setReviewField('relationship',event.target.value)} maxLength={160}/><TextAreaField label="Representative authority checked" required value={review.authorityBasis} onChange={event=>setReviewField('authorityBasis',event.target.value)} maxLength={1000}/></>:null}
      <TextField type="date" label="Signed date (if recorded on form)" value={review.signedOn} onChange={event=>setReviewField('signedOn',event.target.value)}/>
      <label className="flex min-h-[52px] items-center gap-3 rounded-field border border-outline-soft p-3 text-sm"><input type="checkbox" className="h-5 w-5 min-h-0 shrink-0" checked={verified} onChange={event=>setVerified(event.target.checked)} required/>I checked the signature evidence in this patient’s file</label></>:null}
    {task.record?.signatureStatus==='signed'?<TextAreaField label="Reason for correction" value={reason} onChange={event=>setReason(event.target.value)} required maxLength={2000}/>:null}
    <p className="text-sm text-ink-soft">This document stays linked to the visit shown above. Signed originals and earlier versions are retained.</p>
    {error?<p role="alert" className="text-sm text-danger">{error}</p>:null}<Button type="submit" disabled={saving}>{saving?'Saving…':label}</Button><SheetCancelButton disabled={saving}/>
  </form></Sheet>;
};
