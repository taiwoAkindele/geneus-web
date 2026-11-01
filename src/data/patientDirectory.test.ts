import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { Patient,Encounter,InpatientEvent,Location,Unit } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { sqliteTestDatabase } from './testing/sqliteDatabase';
import { setDatabaseForTests } from './database';
import { loadPatientDirectory } from './repos/patientDirectory';
import { patientClinicalRecord } from './repos/clinical';

const base={facilityId:'TEST',schemaVersion:5,createdBy:'staff:doctor',deviceId:'device:one',createdOn:'2026-11-01T08:00:00Z'};
const desk=()=>authorizationFor({staff:{staffId:'staff:desk',role:'records_officer',permission:'read_write'},facilityId:'TEST',deviceId:'device:one'});
describe('patient directory and medical-history boundary',()=>{
  let store:ReturnType<typeof sqliteTestDatabase>;
  beforeEach(async()=>{vi.stubGlobal('localStorage',memoryStorage());store=sqliteTestDatabase();setDatabaseForTests(store.db);await store.seed(Patient.parse({...base,id:'TEST-000001-K2',patientId:'TEST-000001-K2',type:'patient',fullName:'Synthetic Patient',sex:'female',ageYears:30,address:'Test road'}));await store.seed(Patient.parse({...base,id:'TEST-000002-K3',patientId:'TEST-000002-K3',type:'patient',fullName:'Never visited',sex:'male',ageYears:40,address:'Test road'}));});
  afterEach(async()=>{setDatabaseForTests(undefined);await store.db.close();vi.unstubAllGlobals();});
  it('includes patients without visits and returns no clinical entries for front desk',async()=>{
    const read=vi.spyOn(store.db,'getAll');const rows=await loadPatientDirectory(desk());
    expect(rows).toHaveLength(2);expect(rows.every(row=>!row.lastVisit)).toBe(true);
    expect(read.mock.calls.some(([sql])=>/FROM\s+(encounter_entries|clinical_events)\b/i.test(sql))).toBe(false);
    expect(JSON.stringify(rows)).not.toContain('diagnosis');
  });
  it('keeps last visit separate from the older active admission and exposes only location/team facts',async()=>{
    const old=Encounter.parse({...base,id:'visit:old',type:'encounter',patientId:'TEST-000001-K2',openedOn:'2026-10-30T08:00:00Z'}),latest={...old,id:'visit:new',openedOn:'2026-11-01T07:00:00Z'};
    await store.seed(old);await store.seed(latest);
    await store.seed(Unit.parse({...base,id:'unit:ward',unitId:'unit:ward',type:'unit',name:'Ward team'}));
    await store.seed(Location.parse({...base,id:'ward:one',type:'location',name:'Main ward',kind:'ward'}));await store.seed(Location.parse({...base,id:'bed:one',type:'location',name:'Bed 01',kind:'bed',parentId:'ward:one'}));
    const confirmation=InpatientEvent.parse({...base,id:'stay:one',admissionId:'stay:one',type:'inpatient_event',patientId:old.patientId,encounterId:old.id,requestEntryId:'request:one',receivingUnitId:'unit:ward',actorRole:'doctor',action:'confirm',note:'Private admission note'});
    await store.seed(confirmation);await store.seed({...confirmation,id:'stay:bed',previousId:confirmation.id,action:'reserve' as const,wardId:'ward:one',bedId:'bed:one'});
    const row=(await loadPatientDirectory(desk())).find(item=>item.patient.patientId===old.patientId)!;
    expect(row.lastVisit?.id).toBe(latest.id);expect(row.careVisit?.id).toBe(old.id);expect(row.stay).toMatchObject({ward:'Main ward',bed:'Bed 01',team:'Ward team',attending:[]});expect(JSON.stringify(row)).not.toContain('Private admission note');
  });
  it('refuses chart loading before querying medical data, then permits an explicit read-only grant',async()=>{
    const read=vi.spyOn(store.db,'getAll');await expect(patientClinicalRecord('TEST-000001-K2',desk())).rejects.toThrow(/medical history/);expect(read).not.toHaveBeenCalled();
    const reader=authorizationFor({staff:{staffId:'staff:desk',role:'records_officer',permission:'read_only',additionalPermissions:['patient_chart:read']},facilityId:'TEST',deviceId:'device:one'});
    expect((await patientClinicalRecord('TEST-000001-K2',reader)).patients).toHaveLength(1);expect(reader.permissions).not.toContain('encounter:record');
  });
  it('does not expose this hospital chart through a context for another hospital',async()=>{
    const other={...desk(),facilityId:'OTHER',permissions:['patient_chart:read' as const]};
    await expect(patientClinicalRecord('TEST-000001-K2',other)).rejects.toThrow(/another hospital/);
    expect(await loadPatientDirectory(other)).toEqual([]);
  });
});
