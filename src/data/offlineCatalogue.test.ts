import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { Staff,StandardTemplate,StandardTest,type Location,type ResultPart,type ResultTemplate,type ServiceDefinition,type ServiceOffering,type Unit } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests } from '@/lib/secureStorage';
import { sqliteTestDatabase } from './testing/sqliteDatabase';
import { setDatabaseForTests } from './database';
import { recordServerContact } from './deviceCredential';
import { allOfType } from './db';
import { addOwnTests,adoptStandardTests,loadStandardTests } from './repos/investigations';
import { adoptStandardTemplates,saveResultPart,saveResultTemplate } from './repos/resultTemplates';

const base={facilityId:'TEST',schemaVersion:5,createdBy:'system',deviceId:'device:one',createdOn:'2026-11-01T08:00:00Z'};
const admin=()=>authorizationFor({staff:{staffId:'staff:admin',role:'facility_admin',permission:'read_write'},facilityId:'TEST',deviceId:'device:one'});
const loinc={system:'http://loinc.org',code:'58410-2',label:'Full blood count'};
const hb:ResultPart={key:'haemoglobin',label:'Haemoglobin',kind:'number',unit:'g/dL',decimals:1,required:true,ranges:[]};

describe('catalogue and templates saved on this device, offline',()=>{
  let store:ReturnType<typeof sqliteTestDatabase>;
  beforeEach(async()=>{
    vi.stubGlobal('localStorage',memoryStorage());resetSecureStorageForTests();recordServerContact(new Date(Date.now()-60_000).toISOString());store=sqliteTestDatabase();setDatabaseForTests(store.db);
    await store.seed(Staff.parse({...base,createdBy:'staff:admin',id:'staff:admin',staffId:'staff:admin',type:'staff',fullName:'Synthetic administrator',role:'facility_admin',permission:'read_write',active:true}));
    await store.seed(StandardTest.parse({...base,id:'standard_test:TEST:fbc',type:'standard_test',key:'fbc',name:'Full blood count',specimen:'Whole blood (EDTA)',classification:'Haematology',aliases:['FBC','CBC'],concept:loinc}));
    await store.seed(StandardTemplate.parse({...base,id:'standard_template:TEST:fbc',type:'standard_template',key:'fbc',name:'Full blood count',tests:['fbc'],parts:[hb]}));
  });
  afterEach(async()=>{setDatabaseForTests(undefined);await store.db.close();vi.unstubAllGlobals();});

  it('adds standard and own tests from the downloaded list, under one Laboratory it creates when missing, skipping names already used',async()=>{
    expect((await loadStandardTests()).map((t)=>[t.key,t.added])).toEqual([['fbc',false]]);
    expect(await adoptStandardTests(['fbc'],admin())).toEqual({added:['Full blood count'],skipped:[]});
    const definitions=await allOfType<ServiceDefinition>('service_definition');
    expect(definitions[0]).toMatchObject({name:'Full blood count',concept:loinc,investigation:{specimen:'Whole blood (EDTA)',department:'Haematology',aliases:['FBC','CBC']}});
    expect(await addOwnTests([{name:'cbc',specimen:'Blood',classification:'Haematology',aliases:[]},{name:'Serum ferritin',specimen:'Serum',classification:'Chemistry',aliases:['Ferritin']}],admin())).toEqual({added:['Serum ferritin'],skipped:['cbc']});
    const [units,locations,offerings]=await Promise.all([allOfType<Unit>('unit'),allOfType<Location>('location'),allOfType<ServiceOffering>('service_offering')]);
    expect(units.map((u)=>u.name)).toEqual(['Laboratory']);expect(locations.map((l)=>l.name)).toEqual(['Laboratory']);
    expect(offerings.every((o)=>o.unitId===units[0].id&&o.locationIds[0]===locations[0].id)).toBe(true);
    expect((await loadStandardTests())[0].added).toBe(true);
  });

  it('adopts a standard template linked to the adopted test, edits it again while still unsynced, and refuses a second template for the same test',async()=>{
    await adoptStandardTests(['fbc'],admin());
    expect(await adoptStandardTemplates(['fbc'],admin())).toEqual({added:['Full blood count'],skipped:[]});
    const [fbc]=await allOfType<ServiceDefinition>('service_definition');
    let [template]=await allOfType<ResultTemplate>('result_template');
    expect(template).toMatchObject({source:'standard',standardKey:'fbc',status:'active',serviceDefinitionIds:[fbc.id],revision:1});
    for(const name of ['FBC (adult)','FBC']){
      template=await saveResultTemplate({name,status:'active',parts:template.parts,serviceDefinitionIds:template.serviceDefinitionIds},admin(),template);
    }
    expect(template).toMatchObject({name:'FBC',revision:3});
    await expect(saveResultTemplate({name:'Another',status:'active',parts:[hb],serviceDefinitionIds:[fbc.id]},admin())).rejects.toThrow(/already uses the template “FBC”/);
    expect(await adoptStandardTemplates(['fbc'],admin())).toEqual({added:[],skipped:['Full blood count']});
  });

  it('carries a shared part change into every template that uses it, as a new revision',async()=>{
    const shared=await saveResultPart({part:hb,active:true},admin());
    const own=await saveResultTemplate({name:'Haemoglobin',status:'draft',parts:[{...hb,label:'ignored',libraryPartId:shared.id}],serviceDefinitionIds:[]},admin());
    expect(own.parts[0]).toMatchObject({label:'Haemoglobin',libraryPartId:shared.id});
    await saveResultPart({part:{...hb,unit:'g/L',decimals:0},active:true},admin(),shared);
    const [after]=await allOfType<ResultTemplate>('result_template');
    expect(after).toMatchObject({revision:2,parts:[{unit:'g/L',decimals:0,libraryPartId:shared.id}]});
  });
});
