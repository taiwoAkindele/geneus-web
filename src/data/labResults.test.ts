import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { Encounter,EncounterEntry,Patient,ResultTemplate,Staff,type ResultPart } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests } from '@/lib/secureStorage';
import { sqliteTestDatabase } from './testing/sqliteDatabase';
import { setDatabaseForTests } from './database';
import { recordServerContact } from './deviceCredential';
import { allOfType } from './db';
import { saveStep } from './repos/encounters';
import { EMPTY_ENCOUNTER_DATA } from '@/modules/clinical/encounter/encounterRecord';
import { buildLabSubmission,draftsFromReport } from '@/modules/clinical/resultTemplates/labEntry';
import type { EncounterData } from '@/modules/clinical/encounter/types';

const base={facilityId:'TEST',schemaVersion:5,createdBy:'staff:admin',deviceId:'device:one',createdOn:'2026-11-01T08:00:00Z'};
const admin=()=>authorizationFor({staff:{staffId:'staff:admin',role:'facility_admin',permission:'read_write'},facilityId:'TEST',deviceId:'device:one'});
const adult={value:18,unit:'years'} as const;
const parts:ResultPart[]=[
  {key:'haemoglobin',label:'Haemoglobin',kind:'number',unit:'g/dL',decimals:1,required:true,ranges:[{sex:'female',ageFrom:adult,low:12,high:15},{sex:'male',ageFrom:adult,low:13,high:17}]},
  {key:'film',label:'Film comment',kind:'text',required:false},
  {key:'culture',label:'Culture',kind:'culture',required:false,antibiotics:['Ceftriaxone','Ciprofloxacin']},
];
const template=ResultTemplate.parse({...base,id:'result_template:fbc',type:'result_template',name:'Full blood count',status:'active',parts,serviceDefinitionIds:['service_definition:fbc'],source:'own',revision:3});
const patientId='TEST-000001-K2',encounterId='encounter:lab';
const patient=Patient.parse({...base,id:patientId,type:'patient',patientId,fullName:'Synthetic patient',address:'Synthetic address',sex:'female',dateOfBirth:'1992-05-10'});
const fbc={id:'order_item:fbc',name:'Full blood count',serviceDefinitionId:'service_definition:fbc',offeringId:'service_offering:fbc',catalogueRevision:1,definitionRevision:1,priority:'routine'} as const;
const widal={id:'order_item:widal',name:'Widal test',custom:true,priority:'routine'} as const;
const data=(changes:Partial<EncounterData>={}):EncounterData=>({...structuredClone(EMPTY_ENCOUNTER_DATA),lab_order:{tests:[fbc.name,widal.name],items:[fbc,widal]},...changes});
const setup={templates:[template],patient};

describe('entering lab results with a template',()=>{
  it('publishes each value with its label, unit, the patient’s range and the scientist’s flag, and a plain summary',()=>{
    const submission=buildLabSubmission(data({lab_report:{[fbc.id]:{comment:'Repeat in a week',values:{haemoglobin:{value:'10.8',flag:'low'},film:{value:'Microcytic'},culture:{growth:'growth',organisms:[{name:'E. coli',count:'',susceptibility:{Ceftriaxone:'S',Ciprofloxacin:'R'}}]}}}},lab_results:{[widal.id]:'Negative'}}),setup,'2026-11-02T10:00:00Z');
    expect(submission.problems).toEqual([]);
    expect(submission.values.results).toEqual([
      {test:'Full blood count',orderItemId:fbc.id,result:'Haemoglobin 10.8 g/dL (Low); Film comment: Microcytic; Culture: E. coli; Comment: Repeat in a week'},
      {test:'Widal test',orderItemId:widal.id,result:'Negative'},
    ]);
    expect(submission.labReport.patient).toEqual({sex:'female',age:{years:34,months:413,days:12594}});
    expect(submission.labReport.items[0]).toMatchObject({template:{id:template.id,revision:3},values:[{kind:'number',label:'Haemoglobin',unit:'g/dL',value:10.8,flag:'low',range:{sex:'female',low:12,high:15}},{kind:'text',text:'Microcytic'},{kind:'culture',growth:'growth',organisms:[{name:'E. coli',susceptibility:[{antibiotic:'Ceftriaxone',result:'S'},{antibiotic:'Ciprofloxacin',result:'R'}]}]}]});
    expect(draftsFromReport(submission.labReport)[fbc.id].values.haemoglobin).toEqual({value:'10.8',flag:'low'});
  });
  it('names what must be fixed, and leaves untouched tests pending',()=>{
    expect(buildLabSubmission(data({lab_report:{[fbc.id]:{comment:'',values:{haemoglobin:{value:'ten'}}}}}),setup,'2026-11-02T10:00:00Z').problems).toEqual(['Full blood count: Haemoglobin: enter a number']);
    expect(buildLabSubmission(data({lab_report:{[fbc.id]:{comment:'',values:{haemoglobin:{value:'10.85'}}}}}),setup,'2026-11-02T10:00:00Z').problems[0]).toMatch(/1 decimal places/);
    expect(buildLabSubmission(data({lab_report:{[fbc.id]:{comment:'',values:{film:{value:'Normal'}}}}}),setup,'2026-11-02T10:00:00Z').problems[0]).toMatch(/Haemoglobin is required/);
    expect(buildLabSubmission(data({lab_report:{[fbc.id]:{comment:'',values:{culture:{growth:'growth',organisms:[{name:' ',count:'',susceptibility:{}}]}}}}}),setup,'2026-11-02T10:00:00Z').problems[0]).toMatch(/name the organism/);
    const widalOnly=buildLabSubmission(data({lab_results:{[widal.id]:'Negative'}}),setup,'2026-11-02T10:00:00Z');
    expect(widalOnly.problems).toEqual([]);expect(widalOnly.values.results.map((r)=>r.test)).toEqual(['Widal test']);
    expect(buildLabSubmission(data(),setup,'2026-11-02T10:00:00Z').problems).toEqual(['Enter at least one result before previewing the report']);
  });
  it('shows no range, and records none, when the patient’s sex is not recorded',()=>{
    const unknown={...patient,sex:undefined};
    const submission=buildLabSubmission(data({lab_report:{[fbc.id]:{comment:'',values:{haemoglobin:{value:'10.8'}}}}}),{templates:[template],patient:unknown},'2026-11-02T10:00:00Z');
    expect(submission.problems).toEqual([]);expect(submission.labReport.items[0].values[0]).not.toHaveProperty('range');
  });
});

describe('saving structured results on the device',()=>{
  let store:ReturnType<typeof sqliteTestDatabase>;
  const entry=(id:string,step:string,values:Record<string,unknown>)=>EncounterEntry.parse({...base,id,type:'encounter_entry',workflowVersion:1,encounterId,patientId,actorRole:'doctor',step,values});
  beforeEach(async()=>{
    vi.stubGlobal('localStorage',memoryStorage());resetSecureStorageForTests();recordServerContact(new Date(Date.now()-60_000).toISOString());store=sqliteTestDatabase();setDatabaseForTests(store.db);
    await store.seed(Staff.parse({...base,id:'staff:admin',staffId:'staff:admin',type:'staff',fullName:'Synthetic administrator',role:'facility_admin',permission:'read_write',active:true}));
    await store.seed(patient);await store.seed(template);
    await store.seed(Encounter.parse({...base,id:encounterId,type:'encounter',patientId,workflowVersion:1,openedOn:base.createdOn}));
    for(const record of [entry('entry:vitals','vitals',{temperatureC:37}),entry('entry:complaint','complaint',{complaints:['Tiredness']}),entry('entry:order','lab_order',{tests:[fbc.name,widal.name],items:[fbc,widal]}),entry('entry:decision','investigation_review',{decision:'ordered',orderEntryId:'entry:order'})])await store.seed(record);
  });
  afterEach(async()=>{setDatabaseForTests(undefined);await store.db.close();vi.unstubAllGlobals();});

  it('keeps the structured report beside the summary, and refuses one whose range is not the patient’s',async()=>{
    const submission=buildLabSubmission(data({lab_report:{[fbc.id]:{comment:'',values:{haemoglobin:{value:'10.8',flag:'low'}}}}}),setup,new Date().toISOString());
    const forged=structuredClone(submission);(forged.labReport.items[0].values[0] as {range?:unknown}).range={sex:'male',ageFrom:adult,low:13,high:17};
    await expect(saveStep({encounterId,patientId,step:'lab_results',workflowVersion:1,values:forged.values,labReport:forged.labReport},admin())).rejects.toThrow(/normal range shown does not match/);
    const saved=await saveStep({encounterId,patientId,step:'lab_results',workflowVersion:1,values:submission.values,labReport:submission.labReport},admin());
    expect(saved.labReport?.items[0].values[0]).toMatchObject({label:'Haemoglobin',value:10.8});
    expect((await allOfType<EncounterEntry>('encounter_entry')).find((e)=>e.id===saved.id)?.labReport).toEqual(submission.labReport);
  });
});
