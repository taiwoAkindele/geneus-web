import { DocumentFile,DOCUMENT_MAX_BYTES,documentContentType } from '@shared';
import { encryptDeviceBytes,decryptDeviceBytes } from '@/lib/secureStorage';
import { activeEnrollmentMarker } from './facilityWorkspaces';
export type DocumentScope={facilityId:string;deviceId:string;enrollment:string};
export const documentScope=(context:{facilityId:string;deviceId:string}):DocumentScope=>({...context,enrollment:activeEnrollmentMarker()??'legacy'});
type CachedFile={key:string;scope:string;fileId:string;iv:Uint8Array;cipher:ArrayBuffer;byteSize:number;remote:boolean;touched:number};
type CachedFileIndex=Omit<CachedFile,'iv'|'cipher'>;
export type DocumentCacheStore={get:(key:string)=>Promise<CachedFile|undefined>;put:(record:CachedFile)=>Promise<void>;list:()=>Promise<CachedFileIndex[]>;remove:(key:string)=>Promise<void>;markRemote?:(key:string)=>Promise<void>};
const scopeKey=(scope:DocumentScope)=>JSON.stringify([scope.facilityId,scope.deviceId,scope.enrollment]);
const fileKey=(scope:DocumentScope,id:string)=>JSON.stringify([scopeKey(scope),id]);
const request=<T>(operation:IDBRequest<T>)=>new Promise<T>((resolve,reject)=>{operation.onsuccess=()=>resolve(operation.result);operation.onerror=()=>reject(operation.error);});
const open=async()=>{
  if(typeof indexedDB==='undefined')throw new Error('This browser cannot securely store document files');
  const opening=indexedDB.open('geneus-document-cache',2);
  opening.onupgradeneeded=()=>{
    const db=opening.result;if(!db.objectStoreNames.contains('files'))db.createObjectStore('files',{keyPath:'key'});
    if(!db.objectStoreNames.contains('index')){
      const index=db.createObjectStore('index',{keyPath:'key'}),cursor=opening.transaction!.objectStore('files').openCursor();
      cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;const {iv:_iv,cipher:_cipher,...metadata}=item.value as CachedFile;index.put(metadata);item.continue();};
    }
  };return request(opening);
};
const stored=async<T>(mode:IDBTransactionMode,operation:(store:IDBObjectStore)=>IDBRequest<T>,name='files'):Promise<T>=>{
  const db=await open();try{
    const tx=db.transaction(name,mode),complete=new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('Document storage was interrupted'));});
    try{const result=await request(operation(tx.objectStore(name)));await complete;return result;}catch(cause){await complete.catch(()=>{});throw cause;}
  }finally{db.close();}
};
const writeStores=async(operation:(tx:IDBTransaction)=>void)=>{
  const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction(['files','index'],'readwrite');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error??new Error('Document storage was interrupted'));operation(tx);});}finally{db.close();}
};
const browserStore:DocumentCacheStore={
  get:async key=>{const [file,index]=await Promise.all([stored<CachedFile|undefined>('readonly',store=>store.get(key)),stored<CachedFileIndex|undefined>('readonly',store=>store.get(key),'index')]);return file?{...file,...index}:undefined;},
  put:async record=>{const {iv:_iv,cipher:_cipher,...index}=record;await writeStores(tx=>{tx.objectStore('files').put(record);tx.objectStore('index').put(index);});},
  list:()=>stored('readonly',store=>store.getAll(),'index'),
  remove:async key=>{await writeStores(tx=>{tx.objectStore('files').delete(key);tx.objectStore('index').delete(key);});},
  markRemote:async key=>{const db=await open();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('index','readwrite'),store=tx.objectStore('index'),read=store.get(key);read.onsuccess=()=>{if(read.result)store.put({...read.result,remote:true});};tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}finally{db.close();}},
};
let testStore:DocumentCacheStore|undefined;
export const setDocumentCacheForTests=(store?:DocumentCacheStore)=>{testStore=store;};
const cache=()=>testStore??browserStore;
export const documentDigest=async(bytes:Uint8Array):Promise<string>=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.slice().buffer)),value=>value.toString(16).padStart(2,'0')).join('');
export const validateDocumentBytes=async(file:DocumentFile,bytes:Uint8Array):Promise<void>=>{
  if(bytes.byteLength!==file.byteSize || documentContentType(bytes)!==file.mimeType || await documentDigest(bytes)!==file.sha256)throw new Error('The document bytes do not match this file. The existing copy has been retained');
};
export const cacheDocument=async(scope:DocumentScope,file:DocumentFile,bytes:Uint8Array,remote=false):Promise<void>=>{
  await validateDocumentBytes(file,bytes);
  const key=fileKey(scope,file.id),encrypted=await encryptDeviceBytes(bytes,key),store=cache();
  // A bounded working cache: remotely backed-up files may be fetched again; pending files are never evicted.
  const records=await store.list(),prior=records.find(record=>record.key===key);
  let total=records.reduce((sum,record)=>sum+record.byteSize,0)-(prior?.byteSize??0)+file.byteSize;
  for(const record of records.filter(record=>record.remote&&record.key!==key).sort((a,b)=>a.touched-b.touched)){
    if(total<=50*1024*1024)break;await store.remove(record.key);total-=record.byteSize;
  }
  if(total>50*1024*1024)throw new Error('Document storage is full of files awaiting sync. Connect to finish those uploads, then try again');
  await store.put({key,scope:scopeKey(scope),fileId:file.id,...encrypted,byteSize:file.byteSize,remote:remote||Boolean(prior?.remote),touched:Date.now()});
};
export const cachedDocument=async(scope:DocumentScope,file:DocumentFile):Promise<{bytes:Uint8Array;remote:boolean}|undefined>=>{
  const expectedKey=fileKey(scope,file.id),record=await cache().get(expectedKey);if(!record)return;
  if(record.key!==expectedKey || record.scope!==scopeKey(scope))throw new Error('This cached file belongs to another device workspace');
  const bytes=await decryptDeviceBytes(record,expectedKey);await validateDocumentBytes(file,bytes);return {bytes,remote:record.remote};
};
export const confirmDocumentBytes=async(scope:DocumentScope,file:DocumentFile):Promise<void>=>{
  const store=cache(),key=fileKey(scope,file.id);if(store.markRemote){await store.markRemote(key);return;}const record=await store.get(key);if(record)await store.put({...record,remote:true});
};
/** Only a newly staged file whose metadata insert failed may be abandoned here. */
export const abandonStagedDocument=async(scope:DocumentScope,file:DocumentFile):Promise<void>=>{
  await cache().remove(fileKey(scope,file.id));
};
export const stageDocumentFile=async(scope:DocumentScope,input:File):Promise<DocumentFile>=>{
  if(!input.size || input.size>DOCUMENT_MAX_BYTES)throw new Error('Choose a file up to 10 MB');
  const bytes=new Uint8Array(await input.arrayBuffer()),mimeType=documentContentType(bytes);
  if(!mimeType)throw new Error('Choose a PDF, JPEG, PNG or WebP file');
  const file=DocumentFile.parse({id:`document_file:${crypto.randomUUID()}`,fileName:input.name,mimeType,byteSize:bytes.length,sha256:await documentDigest(bytes)});
  await cacheDocument(scope,file,bytes);return file;
};
