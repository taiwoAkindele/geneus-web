import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { EncounterEntry, Location, Unit, Encounter, Patient } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests } from '@/lib/secureStorage';
import { recordServerContact } from './deviceCredential';
import { setDatabaseForTests } from './database';
import { rememberInpatientSupport } from './inpatientSupport';
import { sqliteTestDatabase } from './testing/sqliteDatabase';
import { confirmAdmission, changeAdmission, confirmBedReady, loadInpatient } from './repos/inpatient';
import { allOfType } from './db';
import { clinicalPatientRows, withAdmission } from '@/features/inpatient/summary';
import { summariseEncounter } from '@/features/encounter/encounterSummary';
const context = () => authorizationFor({ staff: {staffId:'staff:doctor',role:'doctor',permission:'read_write'}, facilityId:'TEST',deviceId:'device:one' });
const base = () => ({ facilityId:'TEST',schemaVersion:5,createdBy:'staff:doctor',deviceId:'device:one',createdOn:new Date().toISOString() });
const request = () => EncounterEntry.parse({...base(),id:'request:one',type:'encounter_entry',patientId:'TEST-000001-K2',encounterId:'visit:one',actorRole:'doctor',step:'admission',values:{ward:'Ward A'}});
const visit = () => Encounter.parse({...base(),id:'visit:one',type:'encounter',patientId:'TEST-000001-K2',openedOn:new Date().toISOString()});
describe('inpatient foundation against real SQLite', () => {
  let storage: ReturnType<typeof sqliteTestDatabase>;
  beforeEach(async () => {
    vi.stubGlobal('localStorage',memoryStorage()); resetSecureStorageForTests(); recordServerContact(new Date().toISOString());
    storage=sqliteTestDatabase(); setDatabaseForTests(storage.db); rememberInpatientSupport(context(),1);
    await storage.seed(Patient.parse({...base(),id:'TEST-000001-K2',type:'patient',patientId:'TEST-000001-K2',fullName:'Synthetic Patient',address:'Test road',sex:'female',ageYears:30}));
    await storage.seed(visit()); await storage.seed(request());
    await storage.seed(Unit.parse({...base(),id:'unit:ward',type:'unit',unitId:'WARD',name:'Ward team',active:true}));
    for(const record of [{id:'ward:a',kind:'ward'},{id:'bed:1',kind:'bed',parentId:'ward:a'},{id:'bed:2',kind:'bed',parentId:'ward:a'}]) await storage.seed(Location.parse({...base(),type:'location',name:record.id,...record}));
  });
  afterEach(async () => {setDatabaseForTests(undefined);await storage.db.close();vi.unstubAllGlobals();});
  it('records an inpatient stay through departure and cleaning, preserving the signed source', async () => {
    const originalEntries=await allOfType('encounter_entry');
    expect((await loadInpatient()).requests).toHaveLength(1);
    const confirmed=await confirmAdmission(request(),'unit:ward','',context());
    expect((await loadInpatient()).active).toHaveLength(1); expect((await loadInpatient()).requests).toHaveLength(0);
    const reserved=await changeAdmission(confirmed,'reserve',context(),{wardId:'ward:a',bedId:'bed:1'});
    const arrived=await changeAdmission(reserved,'arrive',context());
    const ready=await changeAdmission(arrived,'ready_for_discharge',context());
    expect((await loadInpatient()).active[0].action).toBe('ready_for_discharge');
    const departure=await changeAdmission(ready,'discharge',context());
    expect((await loadInpatient()).active).toHaveLength(0);
    await confirmBedReady('bed:1',departure.id,context());
    expect(await allOfType('encounter_entry')).toEqual(originalEntries);
  });
  it('checks the admission head under the insertion lock, including a concurrent local-window change', async () => {
    const confirmed=await confirmAdmission(request(),'unit:ward','',context());
    const original=storage.db.writeTransaction; let raced=false;
    storage.db.writeTransaction=async(callback)=>{
      if(!raced){raced=true;await storage.seed({...confirmed,id:'event:concurrent',previousId:confirmed.id,action:'cancel' as const,note:'Withdrawn'});}
      return original(callback);
    };
    await expect(changeAdmission(confirmed,'reserve',context(),{wardId:'ward:a',bedId:'bed:1'})).rejects.toThrow(/changed/);
    expect(await allOfType('inpatient_event')).toHaveLength(2);
  });
  it('does not treat a rejected local reservation or its arrival as accepted bed state', async () => {
    const confirmed=await confirmAdmission(request(),'unit:ward','',context());
    const reserve=await changeAdmission(confirmed,'reserve',context(),{wardId:'ward:a',bedId:'bed:1'});
    await changeAdmission(reserve,'arrive',context());
    await storage.db.execute('INSERT INTO workforce_upload_receipts(id,clientId,outcome) VALUES(?,?,?)',[reserve.id,1,'rejected']);
    const data=await loadInpatient(); expect(data.active[0].action).toBe('confirm'); expect(data.events).toHaveLength(1);
  });
  it('requires an enrolled server capability and respects read-only and cashier access', async () => {
    rememberInpatientSupport(context());
    await expect(confirmAdmission(request(),'unit:ward','',context())).rejects.toThrow(/Connect once/);
    rememberInpatientSupport(context(),1);
    const readonly={...context(),permissions:[]};
    await expect(confirmAdmission(request(),'unit:ward','',readonly)).rejects.toThrow();
    expect(await allOfType('inpatient_event')).toHaveLength(0);
  });
  it('shows one clinical row per patient, preferring an active admission and retaining discharged history', async () => {
    const confirmed=await confirmAdmission(request(),'unit:ward','',context());
    const data=await loadInpatient(),summary=withAdmission(summariseEncounter(visit(),[request()]),data);
    expect(summary.careType).toBe('inpatient'); expect(summary.admissionStatus).toBe('Awaiting bed');
    const later={...summary,id:'later-visit',openedOn:'2099-01-01T00:00:00Z',careType:'outpatient' as const};
    expect(clinicalPatientRows([later,summary])).toEqual([summary]);
    const reserved=await changeAdmission(confirmed,'reserve',context(),{wardId:'ward:a',bedId:'bed:1'}),arrived=await changeAdmission(reserved,'arrive',context()),ready=await changeAdmission(arrived,'ready_for_discharge',context());
    await changeAdmission(ready,'discharge',context());
    expect(withAdmission(summariseEncounter(visit(),[request()]),await loadInpatient()).careType).toBe('past_inpatient');
  });
});
