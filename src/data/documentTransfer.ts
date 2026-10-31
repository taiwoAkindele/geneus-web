import { DocumentFile,type UploadMutation } from '@shared';
import { ApiError } from '@/lib/api/client';
import { uploadDocumentBytes } from '@/lib/api/documents';
import { cachedDocument,confirmDocumentBytes,type DocumentScope } from './documentFiles';
/** Runs inside PowerSync's existing upload transaction loop, including when nobody is signed in. */
export const transferDocumentFiles=async(credential:string,scope:DocumentScope,mutations:readonly UploadMutation[]):Promise<void>=>{
  const done=new Set<string>();
  for(const mutation of mutations){
    if(!['library_document','visit_document'].includes(mutation.table))continue;
    const parsed=DocumentFile.safeParse(mutation.data.file);if(!parsed.success||done.has(parsed.data.id))continue;
    const file=parsed.data,actor=mutation.data.createdBy;
    if(typeof actor!=='string')continue;
    const cached=await cachedDocument(scope,file).catch(()=>undefined);
    if(!cached || cached.remote)continue;
    try{await uploadDocumentBytes(credential,actor,file,cached.bytes);await confirmDocumentBytes(scope,file);done.add(file.id);}
    catch(cause){
      // Permanent refusals go through the normal metadata upload/reconciliation path.
      // A missing/rejected binary must not wedge unrelated queued clinical records.
      if(cause instanceof ApiError && cause.status && cause.status>=400 && cause.status<500 && ![401,408,429].includes(cause.status))continue;
      throw cause;
    }
  }
};
