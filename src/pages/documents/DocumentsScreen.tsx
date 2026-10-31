import { useEffect,useState } from 'react';
import { Link,useSearchParams } from 'react-router-dom';
import { DOCUMENT_SIGNATURE_LABELS,type DocumentSignatureStatus,type LibraryDocument,type VisitDocument } from '@shared';
import { ActionMenu,Button,SectionTabs,SelectField,Tag,TextField } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { useClinicalDocuments } from '@/features/documents/useClinicalDocuments';
import { LibraryDocumentSheet,type LibraryTask } from '@/features/documents/DocumentSheets';
import { DocumentPreview,type DocumentPreviewTarget } from '@/features/documents/DocumentPreview';
import { DocumentHistory } from '@/features/documents/DocumentHistory';
import { WardTable } from '@/features/inpatient/WardTable';
import { patientChartPath } from '@/features/patients/patientRoutes';
import { documentsSupported } from '@/data/documentSupport';

export const documentSize=(size:number)=>size<1024*1024?`${Math.max(1,Math.round(size/1024))} KB`:`${(size/(1024*1024)).toFixed(1)} MB`;
export const DocumentsScreen=()=>{
  const context=useAuthorizationContext(),query=useClinicalDocuments(),[params,setParams]=useSearchParams();
  const tab=params.get('tab')==='visits'?'visits':'library';
  const [search,setSearch]=useState(''),[archive,setArchive]=useState('active'),[signature,setSignature]=useState(''),[ward,setWard]=useState('');
  const [task,setTask]=useState<LibraryTask>(),[preview,setPreview]=useState<DocumentPreviewTarget>(),[history,setHistory]=useState<(LibraryDocument|VisitDocument)[]>();
  useEffect(()=>{document.title='Documents · Geneus Health';},[]);
  if(query.loading)return <p role="status" className="p-6">Reading documents…</p>;
  if(query.error||!query.data)return <div role="alert" className="p-6"><p>Documents could not be read.</p><Button variant="outlined" onClick={query.reload}>Try again</Button></div>;
  const data=query.data,supported=documentsSupported(context),canWrite=context.permissions.includes('encounter:record')&&supported;
  const library=data.libraryHeads.filter(record=>(archive==='all'||(archive==='archived'?record.archived:!record.archived))&&`${record.title} ${record.file.fileName}`.toLowerCase().includes(search.toLowerCase()));
  const patientName=(id:string)=>data.patients.find(patient=>patient.patientId===id)?.fullName??id;
  const stay=(record:VisitDocument)=>data.inpatient.heads.find(event=>event.admissionId===record.admissionId);
  const visits=data.visitHeads.filter(record=>(!signature||record.signatureStatus===signature)&&(!ward||stay(record)?.wardId===ward)&&`${record.title} ${patientName(record.patientId)} ${record.patientId}`.toLowerCase().includes(search.toLowerCase()));
  const location=(record:VisitDocument)=>{
    const admission=stay(record);if(!admission)return 'Stay location unavailable';
    const place=[data.inpatient.locations.find(item=>item.id===admission.wardId)?.name,data.inpatient.locations.find(item=>item.id===admission.bedId)?.name].filter(Boolean).join(' · ')||'Awaiting bed';
    return admission.action==='discharge'?`${place} · Discharged`:place;
  };
  const file=(record:LibraryDocument|VisitDocument)=><><p className="font-bold">{record.title}</p><p className="mt-1 break-words text-sm text-ink-soft">{record.file.fileName} · {record.file.mimeType==='application/pdf'?'PDF':'Image'} · {documentSize(record.file.byteSize)}</p><p className="mt-1 text-sm text-ink-soft">Version {record.version}</p>{data.pending.has(record.id)?<p className="mt-1 text-sm text-amber-text">Saved on this device · Pending sync</p>:null}</>;
  const open=(record:LibraryDocument|VisitDocument,download=false)=>setPreview({file:record.file,title:record.title,download});
  return <div className="mx-auto max-w-[1440px] space-y-5 px-4 py-6 md:px-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-[28px] font-extrabold">Documents</h1><p className="mt-1 text-ink-soft">Manage hospital files and review documents linked to patient visits.</p></div>{tab==='library'&&context.permissions.includes('encounter:record')?<Button fullWidth={false} disabled={!supported} onClick={()=>setTask({action:'upload'})}>Upload document</Button>:null}</header>
    <SectionTabs label="Document views" value={tab} onChange={value=>{setSearch('');setParams({tab:value});}} options={[{value:'library',label:'Library'},{value:'visits',label:'Visit documents'}]}/>
    {!supported?<p role="status" className="rounded-field bg-amber-bg p-4 text-sm text-amber-text">Connect once to confirm document support before uploading new files. <Button variant="ghost" fullWidth={false} onClick={query.reload}>Check again</Button></p>:null}
    {data.rejections.some(record=>['library_document','visit_document'].includes(record.entityType)&&!record.resolvedOn)?<p role="alert" className="rounded-field bg-amber-bg p-4 text-sm text-amber-text">Some document changes need sync review. <Link to="/sync" className="font-bold underline">Review retained changes</Link></p>:null}
    <div className="grid gap-3 md:grid-cols-[minmax(220px,2fr)_1fr_1fr]"><TextField label={tab==='library'?'Search library':'Search patients or documents'} type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder={tab==='library'?'Document name or filename':'Patient name, ID or document'}/>
      {tab==='library'?<SelectField label="Library state" value={archive} onChange={event=>setArchive(event.target.value)} options={[{value:'active',label:'Active documents'},{value:'archived',label:'Archived documents'},{value:'all',label:'All documents'}]}/>:<><SelectField label="Signature status" value={signature} onChange={event=>setSignature(event.target.value)} options={[{value:'',label:'All statuses'},...(Object.entries(DOCUMENT_SIGNATURE_LABELS) as [DocumentSignatureStatus,string][]).map(([value,label])=>({value,label}))]}/><SelectField label="Ward" value={ward} onChange={event=>setWard(event.target.value)} options={[{value:'',label:'All wards'},...data.inpatient.locations.filter(item=>item.kind==='ward').map(item=>({value:item.id,label:item.name}))]}/></>}
    </div>
    {tab==='library'?library.length?<WardTable caption="Hospital document library" rows={library} rowKey={record=>record.id} columns={[
      {key:'document',label:'Document',render:file},
      {key:'updated',label:'Updated',render:record=><><p>{new Date(record.createdOn).toLocaleDateString('en-GB')}</p><p className="mt-1 text-sm text-ink-soft">{data.inpatient.staff.find(member=>member.staffId===record.createdBy)?.fullName??record.createdBy}</p>{record.archived?<Tag tone="slate">Archived</Tag>:null}</>},
      {key:'actions',label:'Actions',render:record=><div className="flex flex-wrap items-center gap-2"><Button variant="outlined" fullWidth={false} onClick={()=>open(record)}>Preview</Button><Button variant="ghost" fullWidth={false} onClick={()=>open(record,true)}>Download</Button><ActionMenu label={`Actions for ${record.title}`} actions={[
        {label:'Version history',onSelect:()=>setHistory(data.library.filter(item=>item.documentId===record.documentId))},
        ...(canWrite&&data.libraryHeads.filter(item=>item.documentId===record.documentId).length===1?[
          ...(!record.archived?[{label:'Replace file',onSelect:()=>setTask({action:'replace' as const,record})},{label:'Rename',onSelect:()=>setTask({action:'rename' as const,record})}]:[]),
          {label:record.archived?'Restore':'Archive',onSelect:()=>setTask({action:record.archived?'restore':'archive',record})},
        ]:[]),
      ]}/></div>},
    ]}/>:<p className="rounded-field border border-dashed border-outline p-6">No library documents match this view.</p>:visits.length?<WardTable caption="Visit document review" rows={visits} rowKey={record=>record.id} columns={[
      {key:'patient',label:'Patient / visit',render:record=><><p className="font-bold">{patientName(record.patientId)}</p><p className="break-all text-sm text-ink-soft">{record.patientId}</p><p className="mt-1 text-sm">{new Date(data.encounters.find(visit=>visit.id===record.encounterId)?.openedOn??record.createdOn).toLocaleDateString('en-GB')}</p><Link className="inline-flex min-h-[52px] items-center font-bold text-brand underline" to={patientChartPath(record.patientId,'documents',{visit:record.encounterId})}>Open patient chart</Link></>},
      {key:'location',label:'Ward / bed',render:location},
      {key:'document',label:'Document',render:file},
      {key:'signature',label:'Signature status',render:record=><Tag tone={record.signatureStatus==='signed'?'slate':'amber'}>{DOCUMENT_SIGNATURE_LABELS[record.signatureStatus]}</Tag>},
      {key:'actions',label:'Actions',render:record=><div className="flex flex-col items-start gap-2"><Button variant="outlined" fullWidth={false} onClick={()=>open(record)}>Preview</Button><Button variant="ghost" fullWidth={false} onClick={()=>open(record,true)}>Download</Button></div>},
    ]}/>:<p className="rounded-field border border-dashed border-outline p-6">No visit documents match these filters.</p>}
    {tab==='visits'?<p className="text-sm text-ink-soft">Add documents and signed copies from the patient chart for an active inpatient visit.</p>:null}
    {task?<LibraryDocumentSheet key={`${task.action}:${task.record?.id??'new'}`} task={task} onClose={()=>setTask(undefined)} onSaved={()=>{setTask(undefined);query.reload();}}/>:null}
    {history&&!preview?<DocumentHistory records={history} onClose={()=>setHistory(undefined)} onPreview={setPreview}/>:null}
    {preview?<DocumentPreview key={preview.file.id} target={preview} onClose={()=>setPreview(undefined)}/>:null}
  </div>;
};
