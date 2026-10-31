import { beforeEach,afterEach,describe,it,expect,vi } from 'vitest';
import { Patient,Encounter,EncounterEntry,Unit,InpatientEvent } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests } from '@/lib/secureStorage';
import { sqliteTestDatabase } from './testing/sqliteDatabase';
import { setDatabaseForTests } from './database';
import { recordServerContact } from './deviceCredential';
import { documentScope,stageDocumentFile,cachedDocument,cacheDocument,setDocumentCacheForTests,type DocumentCacheStore } from './documentFiles';
import { transferDocumentFiles } from './documentTransfer';
import { rememberDocumentSupport } from './documentSupport';
import { uploadLibraryDocument,changeLibraryDocument,attachVisitDocument,updateVisitDocument,loadClinicalDocuments } from './repos/clinicalDocuments';
import { allOfType } from './db';
type Cached=Parameters<DocumentCacheStore['put']>[0];
const context=()=>authorizationFor({staff:{staffId:'staff:doctor',role:'doctor',permission:'read_write'},facilityId:'TEST',deviceId:'device:one'});
const base=()=>({facilityId:'TEST',schemaVersion:5,createdBy:'staff:doctor',deviceId:'device:one',createdOn:new Date().toISOString()});
const pdf=(text='Synthetic hospital form')=>new File([`%PDF-1.4\n${text}\n%%EOF`],'Form.pdf',{type:'application/pdf'});
const admission=()=>InpatientEvent.parse({...base(),id:'stay:one',type:'inpatient_event',admissionId:'stay:one',patientId:'TEST-000001-K2',encounterId:'visit:one',requestEntryId:'request:one',action:'confirm',receivingUnitId:'unit:ward',actorRole:'doctor'});
describe('clinical document persistence and file transfer',()=>{
  let storage:ReturnType<typeof sqliteTestDatabase>,files:Map<string,Cached>;
  beforeEach(async()=>{
    vi.stubGlobal('localStorage',memoryStorage());resetSecureStorageForTests();recordServerContact(new Date().toISOString());
    storage=sqliteTestDatabase();setDatabaseForTests(storage.db);files=new Map();
    setDocumentCacheForTests({get:async key=>files.get(key),put:async record=>{files.set(record.key,record);},list:async()=>[...files.values()],remove:async key=>{files.delete(key);}});
    rememberDocumentSupport(context(),1);
    await storage.seed(Patient.parse({...base(),id:'TEST-000001-K2',type:'patient',patientId:'TEST-000001-K2',fullName:'Synthetic Patient',sex:'female',ageYears:30,address:'Test road'}));
    await storage.seed(Encounter.parse({...base(),id:'visit:one',type:'encounter',patientId:'TEST-000001-K2',openedOn:new Date().toISOString()}));
    await storage.seed(EncounterEntry.parse({...base(),id:'request:one',type:'encounter_entry',patientId:'TEST-000001-K2',encounterId:'visit:one',step:'admission',actorRole:'doctor',values:{ward:'Ward'}}));
    await storage.seed(Unit.parse({...base(),id:'unit:ward',type:'unit',unitId:'WARD',name:'Ward team',active:true}));await storage.seed(admission());
  });
  afterEach(async()=>{setDatabaseForTests(undefined);await storage.db.close();setDocumentCacheForTests();vi.unstubAllGlobals();});
  it('saves encrypted files and metadata offline, then preserves issued copies across library replacement',async()=>{
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
    const original=await uploadLibraryDocument('Consent',pdf(),context());
    const stored=[...files.values()][0];expect(new TextDecoder().decode(stored.cipher)).not.toContain('Synthetic hospital form');expect(stored.remote).toBe(false);expect(fetch).not.toHaveBeenCalled();
    const copy=await attachVisitDocument({admission:admission(),title:'Consent',template:original,signatureStatus:'unsigned'},context());
    const updated=await changeLibraryDocument(original,'replace',context(),pdf('Updated hospital form'));
    const data=await loadClinicalDocuments(context());expect(data.libraryHeads[0].id).toBe(updated.id);expect(data.visitHeads[0].file.id).toBe(original.file.id);expect(copy.templateVersionId).toBe(original.id);
    expect((await cachedDocument(documentScope(context()),original.file))?.bytes).toEqual(new Uint8Array(await pdf().arrayBuffer()));
  });
  it('requires an active inpatient visit and preserves unsigned originals when a reviewed signed copy is added',async()=>{
    const original=await uploadLibraryDocument('Consent',pdf(),context());
    const copy=await attachVisitDocument({admission:admission(),title:'Consent',template:original,signatureStatus:'unsigned'},context());
    const signed=await updateVisitDocument(copy,context(),{admission:admission(),input:pdf('Signed patient scan'),signatureStatus:'signed',signatureReview:{signerName:'Synthetic Patient',signerKind:'patient'}});
    expect(signed.signatureStatus).toBe('signed');expect((await allOfType('visit_document')).find(record=>record.id===copy.id)).toMatchObject({signatureStatus:'unsigned',file:original.file});
    await storage.seed({...admission(),id:'stay:cancel',previousId:admission().id,action:'cancel' as const,note:'Withdrawn'});
    await expect(attachVisitDocument({admission:admission(),title:'Another',template:original,signatureStatus:'unsigned'},context())).rejects.toThrow(/active inpatient/);
  });
  it('checks library revisions under the same SQLite lock as insertion',async()=>{
    const original=await uploadLibraryDocument('Original',pdf(),context()),transaction=storage.db.writeTransaction;let raced=false;
    storage.db.writeTransaction=async callback=>{
      if(!raced){raced=true;await storage.seed({...original,id:'library:other-window',previousId:original.id,version:2,action:'rename' as const,title:'Other window'});}
      return transaction(callback);
    };
    await expect(changeLibraryDocument(original,'rename',context(),undefined,'Stale title')).rejects.toThrow(/changed/);
    expect(await allOfType('library_document')).toHaveLength(2);
  });
  it('releases only an unused staged copy when a local insert is refused',async()=>{
    const original=await uploadLibraryDocument('Original',pdf(),context());
    await changeLibraryDocument(original,'rename',context(),undefined,'Current title');
    await expect(changeLibraryDocument(original,'replace',context(),pdf('Unqueued replacement'))).rejects.toThrow(/changed/);
    expect(files.size).toBe(1);expect(await cachedDocument(documentScope(context()),original.file)).toBeDefined();
  });
  it('removes refused versions and descendants from the effective list without deleting the file cache',async()=>{
    const original=await uploadLibraryDocument('Original',pdf(),context()),updated=await changeLibraryDocument(original,'replace',context(),pdf('Replacement'));
    await storage.db.execute('INSERT INTO workforce_upload_receipts(id,clientId,outcome) VALUES(?,?,?)',[updated.id,1,'rejected']);
    expect((await loadClinicalDocuments(context())).libraryHeads[0].id).toBe(original.id);expect(files.size).toBe(2);
  });
  it('blocks unsupported servers and read-only mutations before caching or writing',async()=>{
    rememberDocumentSupport(context());await expect(uploadLibraryDocument('Form',pdf(),context())).rejects.toThrow(/Connect once/);expect(files.size).toBe(0);
    rememberDocumentSupport(context(),1);await expect(uploadLibraryDocument('Form',pdf(),{...context(),permissions:[]})).rejects.toThrow();expect(await allOfType('library_document')).toHaveLength(0);
  });
  it('scopes cache reads to hospital, device and enrollment and detects modified ciphertext',async()=>{
    const scope=documentScope(context()),file=await stageDocumentFile(scope,pdf());
    expect(await cachedDocument({...scope,facilityId:'OTHER'},file)).toBeUndefined();expect(await cachedDocument({...scope,enrollment:'new-enrollment'},file)).toBeUndefined();
    const stored=[...files.values()][0],bytes=new Uint8Array(stored.cipher.slice(0));bytes[0]^=1;files.set(stored.key,{...stored,cipher:bytes.buffer});
    await expect(cachedDocument(scope,file)).rejects.toThrow();
  });
  it('never replaces a cached file with bytes that fail its checksum',async()=>{
    const scope=documentScope(context()),file=await stageDocumentFile(scope,pdf());
    await expect(cacheDocument(scope,file,new TextEncoder().encode('%PDF-1.4\nDifferent content'))).rejects.toThrow(/do not match/);
    expect(new TextDecoder().decode((await cachedDocument(scope,file))!.bytes)).toContain('Synthetic hospital form');
  });
  it('preserves pending cache entries under storage pressure and evicts only remotely backed-up copies',async()=>{
    const scope=documentScope(context()),file=await stageDocumentFile(scope,pdf()),stored=[...files.values()][0];files.set(stored.key,{...stored,byteSize:50*1024*1024});
    await expect(stageDocumentFile(scope,pdf('New file'))).rejects.toThrow(/awaiting sync/);expect(files.size).toBe(1);
    files.set(stored.key,{...stored,byteSize:50*1024*1024,remote:true});await stageDocumentFile(scope,pdf('New file'));expect(files.has(stored.key)).toBe(false);expect(files.size).toBe(1);expect(file.id).not.toBe([...files.values()][0].fileId);
  });
  it('leaves files pending on network failures and uploads them before metadata is sent',async()=>{
    const file=await stageDocumentFile(documentScope(context()),pdf()),mutation={clientId:1,op:'put' as const,table:'library_document' as const,id:'library:new',data:{file,createdBy:context().userId}};
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:'unavailable',message:'Retry'}),{status:503})));
    await expect(transferDocumentFiles('device.credential',documentScope(context()),[mutation])).rejects.toThrow('Retry');expect((await cachedDocument(documentScope(context()),file))?.remote).toBe(false);
    const fetch=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>new Response(JSON.stringify({id:file.id,sha256:file.sha256,byteSize:file.byteSize,mimeType:file.mimeType}),{status:201}));vi.stubGlobal('fetch',fetch);
    await transferDocumentFiles('device.credential',documentScope(context()),[mutation]);expect((await cachedDocument(documentScope(context()),file))?.remote).toBe(true);expect(fetch).toHaveBeenCalledOnce();
    const init=fetch.mock.calls[0]?.[1] as RequestInit;expect(init.headers).toMatchObject({'content-type':'application/octet-stream','x-actor-staff-id':'staff:doctor'});
  });
  it('keeps file bytes recoverable on permanent refusal while allowing normal metadata reconciliation',async()=>{
    const file=await stageDocumentFile(documentScope(context()),pdf());vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:'forbidden',message:'Access changed'}),{status:403})));
    await transferDocumentFiles('device.credential',documentScope(context()),[{clientId:2,op:'put',table:'library_document',id:'library:new',data:{file,createdBy:context().userId}}]);
    expect((await cachedDocument(documentScope(context()),file))?.remote).toBe(false);
  });
});
