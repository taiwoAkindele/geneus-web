import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DocumentFile,clinicalDocumentAccess,type SyncRejection } from '@shared';
import { Button } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { patientChartPath } from '@/features/patients/patientRoutes';
import { DocumentPreview } from './DocumentPreview';

/** File recovery stays read-only; reissue against current state in the original workflow. */
export const RetainedDocument=({rejection}:{rejection:SyncRejection})=>{
  const context=useAuthorizationContext(),[preview,setPreview]=useState(false);
  const parsed=DocumentFile.safeParse(rejection.refusedRecord?.file);
  if(!clinicalDocumentAccess(context)||!parsed.success)return null;
  const title=typeof rejection.refusedRecord?.title==='string'?rejection.refusedRecord.title:'Retained document';
  const patient=rejection.refusedRecord?.patientId,visit=rejection.refusedRecord?.encounterId;
  const destination=rejection.entityType==='visit_document'&&typeof patient==='string'&&typeof visit==='string'?patientChartPath(patient,'documents',{visit}):'/documents';
  return <div className="mt-3 space-y-2">
    <p className="text-sm">The refused file is retained. Download it before preparing a corrected version in the library or inpatient chart.</p>
    <div className="flex flex-wrap items-center gap-3"><Button variant="outlined" fullWidth={false} onClick={()=>setPreview(true)}>Open retained file</Button><Link to={destination} className="inline-flex min-h-[52px] items-center font-bold text-brand underline">Review current documents</Link></div>
    {preview?<DocumentPreview target={{file:parsed.data,title}} onClose={()=>setPreview(false)}/>:null}
  </div>;
};
