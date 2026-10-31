import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DOCUMENT_SIGNATURE_LABELS,type Encounter,type Patient,type VisitDocument,type InpatientEvent } from '@shared';
import { ActionMenu,Button,SelectField,Tag } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { useClinicalDocuments } from './useClinicalDocuments';
import { VisitDocumentSheet,type VisitDocumentTask } from './DocumentSheets';
import { DocumentPreview,type DocumentPreviewTarget } from './DocumentPreview';
import { DocumentHistory } from './DocumentHistory';
import { WardTable } from '@/features/inpatient/WardTable';
import { documentsSupported } from '@/data/documentSupport';
export const PatientDocuments=({patient,encounters}:{patient:Patient;encounters:Encounter[]})=>{
  const context=useAuthorizationContext(),query=useClinicalDocuments(),[params,setParams]=useSearchParams();
  const [task,setTask]=useState<(VisitDocumentTask&{admission:InpatientEvent;visit:Encounter})>(),[preview,setPreview]=useState<DocumentPreviewTarget>(),[history,setHistory]=useState<VisitDocument[]>();
  if(query.loading)return <p role="status">Reading visit documents…</p>;
  if(query.error||!query.data)return <div role="alert"><p>Visit documents could not be read.</p><Button variant="outlined" onClick={query.reload}>Try again</Button></div>;
  const data=query.data;
  const defaultVisit=data.inpatient.active.find(event=>encounters.some(visit=>visit.id===event.encounterId))?.encounterId??encounters[0]?.id;
  const selectedId=params.get('visit')??defaultVisit;
  const selected=encounters.find(visit=>visit.id===selectedId),admission=data.inpatient.active.find(event=>event.encounterId===selected?.id&&event.patientId===selected.patientId);
  const rows=data.visitHeads.filter(record=>record.encounterId===selected?.id);
  const canWrite=Boolean(admission&&selected)&&context.permissions.includes('encounter:record')&&documentsSupported(context);
  const open=(record:VisitDocument,download=false)=>setPreview({file:record.file,title:record.title,download});
  return <section className="space-y-5" aria-label="Patient visit documents"><header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-extrabold">Documents</h2><p className="mt-1 text-sm text-ink-soft">Files and signed copies for the selected visit.</p></div>{canWrite&&admission&&selected?<Button fullWidth={false} onClick={()=>setTask({action:'attach',admission,visit:selected})}>Add document</Button>:null}</header>
    <SelectField label="Visit for these documents" value={selectedId??''} onChange={event=>setParams(current=>{const next=new URLSearchParams(current);next.set('visit',event.target.value);return next;})} options={[{value:'',label:'Choose a visit'},...encounters.map(visit=>({value:visit.id,label:`${new Date(visit.openedOn).toLocaleString('en-GB')} · ${data.inpatient.active.some(event=>event.encounterId===visit.id)?'Active inpatient':'Recorded visit'}`}))]}/>
    {selected&&!admission?<p className="rounded-field bg-surface-muted p-4 text-sm text-ink-soft">This visit is available for document review. Adding and updating documents requires an active inpatient visit.</p>:null}
    {admission&&!documentsSupported(context)?<p role="status" className="text-sm text-amber-text">Connect once to confirm document support before adding files.</p>:null}
    {rows.length?<WardTable caption="Documents for this visit" rows={rows} rowKey={record=>record.id} columns={[
      {key:'document',label:'Document',render:record=><><p className="font-bold">{record.title}</p><p className="mt-1 break-words text-sm text-ink-soft">{record.file.fileName} · Version {record.version}</p>{data.pending.has(record.id)?<p className="mt-1 text-sm text-amber-text">Saved on this device · Pending sync</p>:null}</>},
      {key:'signature',label:'Signature status',render:record=><><Tag tone={record.signatureStatus==='signed'?'slate':'amber'}>{DOCUMENT_SIGNATURE_LABELS[record.signatureStatus]}</Tag>{record.signatureReview?<p className="mt-2 text-sm">{record.signatureReview.signerName} · {record.signatureReview.signerKind}</p>:null}</>},
      {key:'actions',label:'Actions',render:record=><div className="flex flex-wrap items-center gap-2"><Button variant="outlined" fullWidth={false} onClick={()=>open(record)}>Preview</Button><Button variant="ghost" fullWidth={false} onClick={()=>open(record,true)}>Download</Button><ActionMenu label={`Visit document actions for ${record.title}`} actions={[
        {label:'Version history',onSelect:()=>setHistory(data.visits.filter(item=>item.documentId===record.documentId))},
        ...(canWrite&&admission&&selected?[{label:'Upload signed copy',onSelect:()=>setTask({action:'signed_copy' as const,record,admission,visit:selected})},{label:'Review signature status',onSelect:()=>setTask({action:'status' as const,record,admission,visit:selected})}]:[]),
      ]}/></div>},
    ]}/>:<p className="rounded-field border border-dashed border-outline p-6">No documents are linked to this visit.</p>}
    {task?<VisitDocumentSheet key={`${task.action}:${task.record?.id??'new'}`} task={task} admission={task.admission} visit={task.visit} data={data} patientName={patient.fullName} onClose={()=>setTask(undefined)} onSaved={()=>{setTask(undefined);query.reload();}}/>:null}
    {history&&!preview?<DocumentHistory records={history} onClose={()=>setHistory(undefined)} onPreview={target=>setPreview(target)}/>:null}
    {preview?<DocumentPreview key={preview.file.id} target={preview} onClose={()=>setPreview(undefined)}/>:null}
  </section>;
};
