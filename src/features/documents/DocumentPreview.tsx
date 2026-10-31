import { useEffect,useState } from 'react';
import type { DocumentFile } from '@shared';
import { Button,Sheet } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { readDocumentFile } from '@/data/repos/clinicalDocuments';
export type DocumentPreviewTarget={file:DocumentFile;title:string;download?:boolean};
const download=(url:string,fileName:string)=>{const link=document.createElement('a');link.href=url;link.download=fileName;link.click();};
export const DocumentPreview=({target,onClose}:{target:DocumentPreviewTarget;onClose:()=>void})=>{
  const context=useAuthorizationContext(),[url,setUrl]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let localUrl='';
    setUrl('');setError('');
    readDocumentFile(target.file,context,controller.signal).then(blob=>{if(controller.signal.aborted)return;localUrl=URL.createObjectURL(blob);setUrl(localUrl);if(target.download)download(localUrl,target.file.fileName);})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'The document could not be opened');});
    return()=>{controller.abort();if(localUrl)URL.revokeObjectURL(localUrl);};
  },[target.file.id,context.userId,context.facilityId,context.deviceId,attempt]);
  const print=()=>{
    if(!url)return;
    // The browser PDF viewer supplies its own print command. Images get a clean printable page.
    const popup=window.open(target.file.mimeType==='application/pdf'?url:'about:blank','_blank');
    if(!popup){setError('Allow a new tab to open this document for printing');return;}popup.opener=null;
    if(target.file.mimeType!=='application/pdf'){
      popup.document.title=target.title;const image=popup.document.createElement('img');image.src=url;image.alt=target.title;image.style.maxWidth='100%';image.onload=()=>popup.print();popup.document.body.append(image);
    }
  };
  return <Sheet title={target.title} eyebrow={target.file.fileName} onClose={onClose} placement="side">
    {!url&&!error?<p role="status">Opening document…</p>:null}
    {error?<div role="alert"><p className="text-danger">{error}</p><Button variant="outlined" onClick={()=>setAttempt(attempt+1)}>Try again</Button></div>:null}
    {url?<><div className="mb-4 flex flex-wrap gap-2"><Button fullWidth={false} onClick={()=>download(url,target.file.fileName)}>Download</Button><Button variant="outlined" fullWidth={false} onClick={print}>Open to print</Button></div>
      {target.file.mimeType==='application/pdf'?<iframe title={`Preview: ${target.title}`} src={url} className="h-[65vh] w-full rounded-field border border-outline-soft"/>:<img src={url} alt={target.title} className="max-h-[65vh] w-full rounded-field object-contain"/>}
      <p className="mt-3 text-sm text-ink-soft">{target.file.mimeType==='application/pdf'?'Use the PDF viewer’s print control in the new tab.':'The image opens on a printable page.'}</p></>:null}
  </Sheet>;
};
