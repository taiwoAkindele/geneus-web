import type { DocumentFile } from '@shared';
import { binaryRequest,ApiError } from './client';
export const uploadDocumentBytes=async(credential:string,actorId:string,file:DocumentFile,bytes:Uint8Array):Promise<void>=>{
  const response=await binaryRequest(`/documents/files/${encodeURIComponent(file.id)}`,{method:'POST',cache:'no-store',headers:{authorization:`Bearer ${credential}`,'x-actor-staff-id':actorId,'content-type':'application/octet-stream','x-file-mime':file.mimeType,'x-file-sha256':file.sha256},body:bytes.slice().buffer});
  const receipt=await response.json().catch(()=>undefined) as Partial<DocumentFile>|undefined;
  if(!receipt||receipt.id!==file.id||receipt.sha256!==file.sha256||receipt.byteSize!==file.byteSize||receipt.mimeType!==file.mimeType)throw new ApiError('invalid_file_receipt','The server did not confirm these file bytes. The local copy is retained for retry',502);
};
export const downloadDocumentBytes=async(credential:string,actorId:string,file:DocumentFile,signal?:AbortSignal):Promise<Uint8Array>=>
  new Uint8Array(await (await binaryRequest(`/documents/files/${encodeURIComponent(file.id)}`,{method:'GET',cache:'no-store',headers:{authorization:`Bearer ${credential}`,'x-actor-staff-id':actorId},signal})).arrayBuffer());
