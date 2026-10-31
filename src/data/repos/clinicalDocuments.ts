import {
  LibraryDocument,VisitDocument,documentHeads,usableDocumentVersions,libraryDocumentIssues,visitDocumentIssues,clinicalDocumentAccess,
  usableInpatientEvents,type AuthorizationContext,type AnyDocument,type DocType,type DocumentFile,type DocumentSignatureStatus,type SignatureReview,
  type InpatientEvent,type Encounter,type Patient,type SyncRejection,
} from '@shared';
import { assertAllowed } from '@/auth/authorization';
import { allOfType,envelope,insertRecord,newId,findRecord } from '../db';
import type { LocalDatabase } from '../database';
import { fieldKindsFor } from '../contractShape';
import { TABLE_FOR,WORKFORCE_RECEIPTS_TABLE } from '../tables';
import { fromRow,type Row } from '../rows';
import { activeWorkspace } from '../facilityWorkspaces';
import { pendingWorkforceIds } from './workforce';
import { listWorkforceReceipts } from './workforceReceipts';
import { loadInpatient } from './inpatient';
import { documentsSupported } from '../documentSupport';
import { cachedDocument,cacheDocument,documentScope,stageDocumentFile,abandonStagedDocument } from '../documentFiles';
import { getDeviceCredential } from '../deviceCredential';
import { downloadDocumentBytes } from '@/lib/api/documents';
type Reader=Pick<LocalDatabase,'getOptional'>;
const readLocked=async<T extends AnyDocument>(reader:Reader,type:DocType):Promise<T[]>=>{
  const fields=Object.keys(fieldKindsFor(type)).filter(field=>field!=='type');
  const row=await reader.getOptional<{records:string}>(`SELECT json_group_array(json_object(${fields.map(field=>`'${field}',"${field}"`).join(',')})) AS records FROM ${TABLE_FOR[type]}`);
  return (JSON.parse(row?.records??'[]') as Row[]).map(record=>fromRow<T>(type,record));
};
const state=async(reader?:Reader)=>{
  const read=<T extends AnyDocument>(type:DocType)=>reader?readLocked<T>(reader,type):allOfType<T>(type);
  const [library,visits,rejections,receipts]=await Promise.all([
    read<LibraryDocument>('library_document'),read<VisitDocument>('visit_document'),read<SyncRejection>('sync_rejection'),
    reader?reader.getOptional<{records:string}>(`SELECT json_group_array(json_object('id',id,'outcome',outcome)) AS records FROM ${WORKFORCE_RECEIPTS_TABLE}`).then(row=>JSON.parse(row?.records??'[]') as {id:string;outcome:string}[]):listWorkforceReceipts(),
  ]);
  const rejected=new Set(rejections.filter(item=>['library_document','visit_document','inpatient_event'].includes(item.entityType)).map(item=>item.entityId));
  for(const receipt of receipts)if(receipt.outcome==='rejected')rejected.add(receipt.id);
  return {library:usableDocumentVersions(library,rejected),visits:usableDocumentVersions(visits,rejected),rejected,rejections};
};
export const assertDocumentRead=(context:AuthorizationContext)=>{
  if(!clinicalDocumentAccess(context))throw new Error('Open Documents with your Clinical Services account');
  const workspace=activeWorkspace();if(workspace&&(workspace.facilityId!==context.facilityId||workspace.deviceId!==context.deviceId))throw new Error('Open documents within the current hospital workspace');
};
const assertDocumentWrite=(context:AuthorizationContext)=>{
  assertDocumentRead(context);assertAllowed(context,'encounter:record');
  if(!documentsSupported(context))throw new Error('Connect once to confirm this server supports document files before adding documents');
};
export const loadClinicalDocuments=async(context:AuthorizationContext)=>{
  assertDocumentRead(context);
  const [data,pending,inpatient]=await Promise.all([state(),pendingWorkforceIds(),loadInpatient()]);
  const libraryHeads=documentHeads(data.library).sort((a,b)=>a.title.localeCompare(b.title));
  const visitHeads=documentHeads(data.visits).sort((a,b)=>b.createdOn.localeCompare(a.createdOn));
  const [patients,encounters]=await Promise.all([
    Promise.all([...new Set(visitHeads.map(record=>record.patientId))].map(id=>findRecord<Patient>('patient',id))),
    Promise.all([...new Set(visitHeads.map(record=>record.encounterId))].map(id=>findRecord<Encounter>('encounter',id))),
  ]);
  return {...data,pending,inpatient,libraryHeads,visitHeads,patients:patients.filter((item):item is Patient=>Boolean(item)),encounters:encounters.filter((item):item is Encounter=>Boolean(item))};
};
export type ClinicalDocumentsData=Awaited<ReturnType<typeof loadClinicalDocuments>>;
const writeLibrary=(record:LibraryDocument,context:AuthorizationContext)=>insertRecord<LibraryDocument>(context,'encounter:record','library_document',record,{checkUnderLock:async reader=>{
  const issues=libraryDocumentIssues(record,(await state(reader)).library);if(issues.length)throw new Error(issues.join('. '));
}});
const persistFile=async<T>(context:AuthorizationContext,input:File|undefined,existing:DocumentFile|undefined,save:(file:DocumentFile)=>Promise<T>):Promise<T>=>{
  const scope=documentScope(context),file=input?await stageDocumentFile(scope,input):existing;
  if(!file)throw new Error('Choose a document file');
  try{return await save(file);}catch(cause){
    // A failed local insert queued nothing. Keep the form's selected File and release its unused cache copy.
    if(input)try{await abandonStagedDocument(scope,file);}catch{throw new Error(`${cause instanceof Error?cause.message:'The document could not be saved'}. The unused file cache could not be cleared; keep your selected file and retry`);}
    throw cause;
  }
};
export const uploadLibraryDocument=async(title:string,input:File,context:AuthorizationContext)=>{
  assertDocumentWrite(context);LibraryDocument.shape.title.parse(title);
  const id=newId('library_document');
  return persistFile(context,input,undefined,file=>writeLibrary(LibraryDocument.parse({...envelope(context),id,type:'library_document',documentId:id,version:1,title,file,actorRole:context.role,action:'upload',archived:false}),context));
};
export const changeLibraryDocument=async(previous:LibraryDocument,action:Exclude<LibraryDocument['action'],'upload'>,context:AuthorizationContext,input?:File,title=previous.title)=>{
  assertDocumentWrite(context);LibraryDocument.shape.title.parse(title);
  return persistFile(context,input,previous.file,file=>writeLibrary(LibraryDocument.parse({...previous,...envelope(context),id:newId('library_document'),previousId:previous.id,version:previous.version+1,title,file,actorRole:context.role,action,archived:action==='archive'?true:action==='restore'?false:previous.archived}),context));
};
type VisitAttachment={admission:InpatientEvent;title:string;template?:LibraryDocument;input?:File;signatureStatus:DocumentSignatureStatus;signatureReview?:SignatureReview};
const writeVisit=(record:VisitDocument,context:AuthorizationContext)=>insertRecord<VisitDocument>(context,'encounter:record','visit_document',record,{checkUnderLock:async reader=>{
  const [data,admissions,encounterRow]=await Promise.all([state(reader),readLocked<InpatientEvent>(reader,'inpatient_event'),reader.getOptional<Row>('SELECT * FROM encounters WHERE id = ?',[record.encounterId])]);
  const issues=visitDocumentIssues(record,{documents:data.visits,library:data.library,admissions:usableInpatientEvents(admissions,data.rejected),encounter:encounterRow?fromRow<Encounter>('encounter',encounterRow):undefined});
  if(issues.length)throw new Error(issues.join('. '));
}});
export const attachVisitDocument=async(save:VisitAttachment,context:AuthorizationContext)=>{
  assertDocumentWrite(context);VisitDocument.shape.title.parse(save.title);
  if(Boolean(save.template)===Boolean(save.input))throw new Error('Choose a library document or a patient-specific file');
  const id=newId('visit_document'),admission=save.admission;
  return persistFile(context,save.input,save.template?.file,file=>writeVisit(VisitDocument.parse({...envelope(context),id,type:'visit_document',documentId:id,version:1,title:save.title,file,actorRole:context.role,
    patientId:admission.patientId,encounterId:admission.encounterId,admissionId:admission.admissionId,admissionEventId:admission.id,templateVersionId:save.template?.id,action:'attach',signatureStatus:save.signatureStatus,signatureReview:save.signatureReview}),context));
};
export const updateVisitDocument=async(previous:VisitDocument,context:AuthorizationContext,save:{admission:InpatientEvent;input?:File;signatureStatus:DocumentSignatureStatus;signatureReview?:SignatureReview;changeReason?:string})=>{
  assertDocumentWrite(context);
  return persistFile(context,save.input,previous.file,file=>writeVisit(VisitDocument.parse({...previous,...envelope(context),id:newId('visit_document'),previousId:previous.id,version:previous.version+1,actorRole:context.role,
    admissionEventId:save.admission.id,file,action:save.input?'signed_copy':'status',signatureStatus:save.signatureStatus,signatureReview:save.signatureReview,changeReason:save.changeReason?.trim()||undefined}),context));
};
export const readDocumentFile=async(file:DocumentFile,context:AuthorizationContext,signal?:AbortSignal):Promise<Blob>=>{
  assertDocumentRead(context);const scope=documentScope(context);
  const cached=await cachedDocument(scope,file).catch(()=>undefined);if(cached)return new Blob([cached.bytes.slice().buffer],{type:file.mimeType});
  const device=getDeviceCredential();if(!device||device.facilityId!==context.facilityId||device.deviceId!==context.deviceId)throw new Error('Connect this enrolled device to download the file. Files already opened on this device remain available offline');
  const bytes=await downloadDocumentBytes(device.credential,context.userId,file,signal);if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  assertDocumentRead(context);await cacheDocument(scope,file,bytes,true);return new Blob([bytes.slice().buffer],{type:file.mimeType});
};
