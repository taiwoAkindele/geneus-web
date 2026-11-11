import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { AnswerList,ResultPartDefinition,ResultTemplate,ServiceDefinition,type ResultPart } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests } from '@/lib/secureStorage';
import { sqliteTestDatabase } from './testing/sqliteDatabase';
import { setDatabaseForTests } from './database';
import { recordServerContact } from './deviceCredential';
import { fieldKindsFor } from './contractShape';
import { loadAnswerListPage,loadPartPage,loadResultTemplateSettings,loadTemplatePage } from './repos/resultTemplates';
import { loadCataloguePage } from './repos/investigations';
import { partKeyFor,rangeAudience,rangeSummary } from '@/modules/clinical/resultTemplates/labels';

const base={facilityId:'TEST',schemaVersion:5,createdBy:'staff:admin',deviceId:'device:one',createdOn:'2026-11-01T08:00:00Z'};
const admin=()=>authorizationFor({staff:{staffId:'staff:admin',role:'facility_admin',permission:'read_write'},facilityId:'TEST',deviceId:'device:one'});
const hb={key:'haemoglobin',label:'Haemoglobin',kind:'number',unit:'g/dL',decimals:1,required:true,libraryPartId:'result_part:hb',ranges:[{sex:'female',ageFrom:{value:18,unit:'years'},low:12,high:15}]} satisfies ResultPart;
const rapid={key:'result',label:'Result',kind:'choice',required:true,answers:['Non-reactive','Reactive'],answerListId:'answer_list:reactivity'} satisfies ResultPart;

describe('result templates on the device',()=>{
  let store:ReturnType<typeof sqliteTestDatabase>;
  const test=(name:string)=>ServiceDefinition.parse({...base,id:`service_definition:${name}`,type:'service_definition',name,category:'laboratory',concept:{system:'local',code:name,label:name},orderable:true,active:true,revision:1,investigation:{specimen:'Blood',department:'Haematology',aliases:[]}});
  const template=(id:string,name:string,parts:unknown[],tests:string[],status='active')=>ResultTemplate.parse({...base,id,type:'result_template',name,status,parts,serviceDefinitionIds:tests.map((t)=>`service_definition:${t}`),source:'own',revision:1});
  beforeEach(async()=>{
    vi.stubGlobal('localStorage',memoryStorage());resetSecureStorageForTests();recordServerContact(new Date(Date.now()-60_000).toISOString());store=sqliteTestDatabase();setDatabaseForTests(store.db);
    for(const name of ['Full blood count','HIV rapid test','Hepatitis B surface antigen','Widal test'])await store.seed(test(name));
    await store.seed(template('result_template:fbc','Full blood count',[hb],['Full blood count']));
    await store.seed(template('result_template:rapid','Rapid test: Reactive / Non-reactive',[rapid],['HIV rapid test','Hepatitis B surface antigen']));
    await store.seed(template('result_template:draft','Obstetric ultrasound',[{key:'impression',label:'Impression',kind:'section',required:true}],[],'draft'));
    await store.seed(ResultPartDefinition.parse({...base,id:'result_part:hb',type:'result_part',part:hb,active:true,revision:1}));
    await store.seed(AnswerList.parse({...base,id:'answer_list:reactivity',type:'answer_list',name:'Reactivity',answers:['Non-reactive','Reactive'],active:true,revision:1}));
  });
  afterEach(async()=>{setDatabaseForTests(undefined);await store.db.close();vi.unstubAllGlobals();});

  it('stores a part of any kind as JSON and reads every setting back unchanged',async()=>{
    expect(fieldKindsFor('result_part').part).toBe('json');
    const settings=await loadResultTemplateSettings();
    expect(settings.templates.map((t)=>t.name)).toEqual(['Full blood count','Obstetric ultrasound','Rapid test: Reactive / Non-reactive']);
    expect(settings.parts[0].part).toEqual(hb);
    expect(settings.lists[0].answers).toEqual(['Non-reactive','Reactive']);
  });

  it('pages templates and finds them by the name of a test that uses them',async()=>{
    const all=await loadTemplatePage(admin(),{});
    expect(all.total).toBe(3);
    expect(all.items.find((row)=>row.template.id==='result_template:rapid')?.tests).toEqual(['HIV rapid test','Hepatitis B surface antigen']);
    const byTest=await loadTemplatePage(admin(),{query:'hepatitis'});
    expect(byTest.items.map((row)=>row.template.name)).toEqual(['Rapid test: Reactive / Non-reactive']);
    expect((await loadTemplatePage(admin(),{pageSize:2,page:1})).items).toHaveLength(1);
  });

  it('counts the templates that use each shared part and answer list',async()=>{
    expect((await loadPartPage(admin(),{})).items[0]).toMatchObject({uses:1});
    expect((await loadAnswerListPage(admin(),{query:'reactive'})).items[0]).toMatchObject({uses:1});
  });

  it('shows each catalogue test’s template in use, and none for a test without one',async()=>{
    const page=await loadCataloguePage(admin(),{});
    expect(page.items.find((row)=>row.definition.name==='Full blood count')?.template).toEqual({name:'Full blood count',parts:1});
    expect(page.items.find((row)=>row.definition.name==='Widal test')?.template).toBeUndefined();
  });

  it('describes ranges and makes unique part keys',()=>{
    expect(rangeAudience(hb.ranges[0])).toBe('Women, 18 years and over');
    expect(rangeAudience({ageFrom:{value:5,unit:'years'},ageTo:{value:18,unit:'years'}})).toBe('Anyone, 5 to 18 years');
    expect(rangeAudience({ageTo:{value:1,unit:'months'}})).toBe('Anyone, under 1 month');
    expect(rangeSummary(hb)).toBe('12–15 · Women, 18 years and over');
    expect(rangeSummary(rapid)).toBe('—');
    expect(partKeyFor('White cell count',[])).toBe('white_cell_count');
    expect(partKeyFor('White cell count',['white_cell_count'])).toBe('white_cell_count_2');
    expect(partKeyFor('25-OH vitamin D',[])).toBe('p_25_oh_vitamin_d');
  });
});
