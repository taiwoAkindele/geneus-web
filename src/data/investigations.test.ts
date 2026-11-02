import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { Location,ServiceDefinition,ServiceOffering,Staff,Unit } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests } from '@/lib/secureStorage';
import { sqliteTestDatabase } from './testing/sqliteDatabase';
import { setDatabaseForTests } from './database';
import { recordServerContact } from './deviceCredential';
import { loadCataloguePage,setInvestigationPrice } from './repos/investigations';
import { listFeeItems } from './repos/billing';

const base={facilityId:'TEST',schemaVersion:5,createdBy:'staff:admin',deviceId:'device:one',createdOn:'2026-11-01T08:00:00Z'};
const admin=()=>authorizationFor({staff:{staffId:'staff:admin',role:'facility_admin',permission:'read_write'},facilityId:'TEST',deviceId:'device:one'});

describe('lab test catalogue on the device',()=>{
  let store:ReturnType<typeof sqliteTestDatabase>;
  /** Catalogue entries arrive from the server by sync; tests seed them the same way. */
  const seedTest=async(name:string,aliases:string[]=[],facilityId='TEST')=>{
    const id=`service_definition:${name}`;
    await store.seed(ServiceDefinition.parse({...base,facilityId,id,type:'service_definition',name,category:'laboratory',concept:{system:'local',code:id,label:name},orderable:true,active:true,revision:1,investigation:{specimen:'Serum',department:'Chemistry',aliases}}));
    await store.seed(ServiceOffering.parse({...base,facilityId,id:`service_offering:${name}`,type:'service_offering',serviceDefinitionId:id,unitId:'unit:lab',name,locationIds:['location:lab'],delivery:'physical',requiredActions:['perform_test','record_result'],intakePolicy:'both',timeZone:'Africa/Lagos',configuration:'active',resourceReadiness:'available',revision:1}));
  };
  beforeEach(async()=>{
    vi.stubGlobal('localStorage',memoryStorage());resetSecureStorageForTests();recordServerContact(new Date(Date.now()-60_000).toISOString());store=sqliteTestDatabase();setDatabaseForTests(store.db);
    await store.seed(Unit.parse({...base,id:'unit:lab',unitId:'unit:lab',type:'unit',name:'Main laboratory'}));
    await store.seed(Location.parse({...base,id:'location:lab',type:'location',name:'Laboratory room',kind:'room'}));
    await store.seed(Staff.parse({...base,id:'staff:admin',staffId:'staff:admin',type:'staff',fullName:'Synthetic administrator',role:'facility_admin',permission:'read_write',active:true}));
  });
  afterEach(async()=>{setDatabaseForTests(undefined);await store.db.close();vi.unstubAllGlobals();});

  it('pages, searches other names and sorts in the database, only for this facility',async()=>{
    for(let i=0;i<30;i++)await seedTest(`Test ${String(i).padStart(2,'0')}`,i===7?['Special alias']:[]);
    await seedTest('Other facility test',[],'OTHER');
    const first=await loadCataloguePage(admin(),{pageSize:25});
    expect(first.total).toBe(30);expect(first.items).toHaveLength(25);expect(first.items[0].definition.name).toBe('Test 00');
    expect(first.items[0].offering?.unitId).toBe('unit:lab');
    const second=await loadCataloguePage(admin(),{page:1,pageSize:25});
    expect(second.items.map(row=>row.definition.name)).toEqual(['Test 25','Test 26','Test 27','Test 28','Test 29']);
    expect((await loadCataloguePage(admin(),{descending:true})).items[0].definition.name).toBe('Test 29');
    const search=await loadCataloguePage(admin(),{query:'special'});
    expect(search.total).toBe(1);expect(search.items[0].definition.name).toBe('Test 07');
    expect((await loadCataloguePage(admin(),{query:'50%_'})).total).toBe(0);
  });

  it('creates a laboratory fee for an unpriced test, then updates that fee in place',async()=>{
    await seedTest('Lipid profile');
    let [row]=(await loadCataloguePage(admin(),{})).items;
    expect(row.fee).toBeUndefined();
    await setInvestigationPrice(row,450000,admin());
    [row]=(await loadCataloguePage(admin(),{})).items;
    expect(row.fee).toMatchObject({name:'Lipid profile',category:'laboratory',chargeWhen:'when_ordered',amountMinor:450000,currency:'NGN'});
    await setInvestigationPrice(row,500000,admin());
    expect((await listFeeItems()).map(fee=>fee.amountMinor)).toEqual([500000]);
  });

  it('refuses a price change from staff who cannot manage fees',async()=>{
    await seedTest('Widal test');
    const nurse=authorizationFor({staff:{staffId:'staff:nurse',role:'nurse',permission:'read_write'},facilityId:'TEST',deviceId:'device:one'});
    const [row]=(await loadCataloguePage(admin(),{})).items;
    await expect(setInvestigationPrice(row,1000,nurse)).rejects.toThrow();
    expect(await listFeeItems()).toEqual([]);
  });
});
