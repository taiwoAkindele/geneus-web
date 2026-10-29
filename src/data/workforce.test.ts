import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicKeyAsync, signAsync, utils } from '@noble/ed25519';
import { Appointment, Facility, Staff, Unit, Location, ServiceDefinition, ServiceOffering, AuthoritySnapshot, authoritySignaturePayload, type AnyDocument, type ClinicalGrant } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests, secureSet } from '@/lib/secureStorage';
import { zonedInstant, zonedInput } from '@/lib/workforceTime';
import { fieldKindsFor } from './contractShape';
import { TABLE_FOR, WORKFORCE_DRAFTS_TABLE, WORKFORCE_RECEIPTS_TABLE, CLINICAL_REVIEWS_TABLE } from './tables';
import { setDatabaseForTests, type LocalDatabase } from './database';
import { toRow } from './rows';
import { allOfType, findRecord } from './db';
import { recordServerContact } from './deviceCredential';
import { fakeDatabase } from './testing/fakeDatabase';
import { saveWorkforce, saveWeeklyOccurrence } from './repos/workforce';
import { readWorkforceDraft, writeWorkforceDraft } from './repos/workforceDrafts';
import { saveStep } from './repos/encounters';
import { reallocateAppointment } from './repos/appointments';
import { listClinicalReviews, acknowledgeClinicalReview } from './repos/clinicalReviews';
import { acceptedAuthority } from './workforceAuthority';
import { clinicalPayloadHash, selectCareService } from './workforceClinical';
type Statement = {
  run: (...values: unknown[]) => {
    changes: number;
  };
  all: (...values: unknown[]) => unknown[];
  get: (...values: unknown[]) => unknown;
};
type Sqlite = {
  DatabaseSync: new (path: string) => {
    exec: (sql: string) => void;
    prepare: (sql: string) => Statement;
    close: () => void;
  };
};
const moduleName = 'node:sqlite';
const { DatabaseSync } = await import(/* @vite-ignore */ moduleName) as Sqlite;
const database = () => {
  const sqlite = new DatabaseSync(':memory:');
  for (const [type, table] of Object.entries(TABLE_FOR))
    sqlite.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY,${[...Object.keys(fieldKindsFor(type as keyof typeof TABLE_FOR)).filter((k) => k !== 'id'), '_metadata'].map((k) => `"${k}"`).join(',')})`);
  sqlite.exec(`CREATE TABLE ps_crud(id INTEGER PRIMARY KEY,data TEXT);CREATE TABLE ${WORKFORCE_RECEIPTS_TABLE}(id TEXT PRIMARY KEY,clientId INTEGER,outcome TEXT);CREATE TABLE ${WORKFORCE_DRAFTS_TABLE}(id TEXT PRIMARY KEY,staffId,deviceId,slot,data,updatedOn);CREATE TABLE ${CLINICAL_REVIEWS_TABLE}(id TEXT PRIMARY KEY,facilityId,staffId,semanticKey,data);`);
  const bind = (values: unknown[]) => values.map((v) => v === undefined ? null : v);
  const execute = async (sql: string, args: unknown[] = []) => ({ rowsAffected: sqlite.prepare(sql).run(...bind(args)).changes });
  const db: LocalDatabase = {
    ...fakeDatabase(), execute, getAll: async <T>(sql: string, args: unknown[] = []) => sqlite.prepare(sql).all(...bind(args)) as T[], getOptional: async <T>(sql: string, args: unknown[] = []) => sqlite.prepare(sql).get(...bind(args)) as T || null, writeTransaction: async (callback) => {
      sqlite.exec('BEGIN'); try {
        const result = await callback({ execute,getOptional:async<T>(sql:string,args:unknown[]=[])=>sqlite.prepare(sql).get(...bind(args)) as T||null });
        sqlite.exec('COMMIT');
        return result;
      }
        catch (cause) {
          sqlite.exec('ROLLBACK');
          throw cause;
        }
    }, close: async () => sqlite.close()
  };
  const seed = async (record: AnyDocument) => { const row = toRow(record.type, record), keys = Object.keys(row); await execute(`INSERT INTO ${TABLE_FOR[record.type]}(${keys.map((k) => `"${k}"`).join(',')}) VALUES(${keys.map(() => '?').join(',')})`, keys.map((k) => row[k])); };
  return { db, seed, execute };
};
describe('workforce against real SQLite and signed authority', () => {
  let storage: ReturnType<typeof database>;
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); resetSecureStorageForTests(); recordServerContact(new Date().toISOString()); storage = database(); setDatabaseForTests(storage.db); });
  afterEach(async () => { setDatabaseForTests(undefined); await storage.db.close(); vi.unstubAllGlobals(); });
  const setup = async (restricted = false) => {
    const now = Date.now(), env = { facilityId: 'WF-PHC', deviceId: 'device:wf', createdBy: 'staff:admin', createdOn: new Date(now - 3600000).toISOString(), schemaVersion: 4 };
    const facility = Facility.parse({ ...env, id: 'WF-PHC', type: 'facility', code: 'WF-PHC', name: 'Synthetic facility', state: 'Oyo', lga: 'Ibadan', timeZone: 'Africa/Lagos', workforcePolicy: { contractVersion: 1, schemaVersion: 4, policyVersion: 10, revision: 1, mode: 'enforced', effectiveOn: env.createdOn, governanceReference: 'synthetic:review' } });
    const admin = Staff.parse({ ...env, id: 'staff:admin', staffId: 'staff:admin', type: 'staff', fullName: 'Synthetic manager', role: 'facility_admin', permission: 'read_write', active: true });
    const nurse = Staff.parse({ ...admin, id: 'staff:nurse', staffId: 'staff:nurse', fullName: 'Synthetic nurse', role: 'nurse' }), checker = Staff.parse({ ...admin, id: 'staff:checker', staffId: 'staff:checker', fullName: 'Synthetic checker', role: 'doctor' });
    const unit = Unit.parse({ ...env, id: 'unit:wf', unitId: 'legacy:wf', type: 'unit', name: 'Care team', kind: 'unit', revision: 1, active: true }), location = Location.parse({ ...env, id: 'location:wf', type: 'location', name: 'Consulting room', kind: 'room', unitId: unit.id, revision: 1, active: true });
    const definition = ServiceDefinition.parse({ ...env, id: 'definition:wf', type: 'service_definition', name: 'Consultation', category: 'consultation', concept: { system: 'urn:synthetic', code: 'consult', label: 'Consultation' }, active: true, revision: 1 });
    const offering = ServiceOffering.parse({ ...env, id: 'offering:wf', type: 'service_offering', name: 'Outpatient care', serviceDefinitionId: definition.id, unitId: unit.id, locationIds: [location.id], delivery: 'physical', intakePolicy: 'both', timeZone: 'Africa/Lagos', configuration: 'active', revision: 1, requiredActions: ['assess'] });
    const secret = utils.randomSecretKey(), publicKey = await getPublicKeyAsync(secret), encoded = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    await secureSet('geneus.workforce.verificationKeys', JSON.stringify([{ kid: 'synthetic-key', kty: 'OKP', crv: 'Ed25519', x: encoded(publicKey).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }]));
    const proof = async (person: typeof nurse, condition = false) => {
      const grant: ClinicalGrant = { capabilityId: `cap:${person.id}`, decisionId: `decision:${person.id}`, scope: { kind: 'offerings', offeringIds: [offering.id], actions: ['assess'] }, startsAt: env.createdOn, endsAt: new Date(now + 30 * 86400000).toISOString(), supervisorId: condition ? checker.id : undefined, independentCheck: condition };
      const record = AuthoritySnapshot.parse({ ...env, id: `proof:${person.id}`, type: 'authority_snapshot', createdBy: 'system', staffId: person.id, revision: 1, policyVersion: 10, issuedOn: env.createdOn, expiresOn: new Date(now + 6 * 86400000).toISOString(), grants: [grant], reviewScopes: [], sourceDecisionIds: [grant.decisionId], keyId: 'synthetic-key', signature: 'placeholder' });
      record.signature = encoded(await signAsync(new TextEncoder().encode(authoritySignaturePayload(record)), secret));
      return record;
    };
    const nurseProof = await proof(nurse, restricted), checkerProof = await proof(checker);
    for (const record of [facility, admin, nurse, checker, unit, location, definition, offering, nurseProof, checkerProof])
      await storage.seed(record);
    const ctx = (staff: typeof nurse) => authorizationFor({ staff, facilityId: env.facilityId, deviceId: env.deviceId });
    return { env, facility, admin, nurse, checker, unit, location, offering, nurseProof, checkerProof, adminContext: ctx(admin), nurseContext: ctx(nurse), checkerContext: ctx(checker) };
  };
  it('verifies actual signatures and rejects forged scope even when its signature is reused', async () => {
    const f = await setup();
    expect(await acceptedAuthority(f.nurseProof)).toBeDefined();
    expect(await acceptedAuthority({ ...f.nurseProof, grants: [] })).toBeUndefined();
    await secureSet('geneus.workforce.verificationKeys', '[]');
    expect(await acceptedAuthority(f.nurseProof)).toBeUndefined();
  });
  it('keeps aliases, checks hierarchy and preserves a refused configuration draft', async () => {
    const f = await setup();
    await expect(saveWorkforce('unit', { name: f.unit.name, kind: 'unit', active: true }, f.adminContext)).rejects.toThrow();
    await expect(saveWorkforce('unit', { ...f.unit, parentId: f.unit.id }, f.adminContext, f.unit)).rejects.toThrow();
    await writeWorkforceDraft(f.adminContext, 'unit:new', { name: 'Unsaved care team' });
    expect(await readWorkforceDraft(f.adminContext, 'unit:new')).toEqual({ name: 'Unsaved care team' });
    expect(await readWorkforceDraft({ ...f.adminContext, userId: 'someone-else' }, 'unit:new')).toBeUndefined();
  });
  it('uses configuration CAS and refuses a stale editor without changing the accepted record', async () => {
    const f = await setup();
    await saveWorkforce('unit', { name: 'Updated care team', kind: 'unit', active: true }, f.adminContext, f.unit);
    await expect(saveWorkforce('unit', { name: 'Stale edit', kind: 'unit', active: true }, f.adminContext, f.unit)).rejects.toThrow(/changed/);
    expect((await findRecord('unit', f.unit.id))?.type).toBe('unit');
    const saved = await findRecord<typeof f.unit>('unit', f.unit.id);
    expect(saved?.name).toBe('Updated care team');
    expect(saved?.unitId).toBe('legacy:wf');
  });
  it('checks retirement impact and does not write through read-only membership', async () => {
    const f = await setup();
    await expect(saveWorkforce('location', { active: false }, f.adminContext, f.location)).rejects.toThrow();
    await storage.execute('UPDATE staff SET permission = ? WHERE id = ?', ['read_only', f.admin.id]);
    await expect(saveWorkforce('unit', { name: 'Forbidden team', kind: 'unit', active: true }, f.adminContext)).rejects.toThrow(/writable/);
  });
  it('supports SQLite view updates with zero row counts and rechecks revisions under the write lock',async()=>{
    const f=await setup();
    await storage.execute('ALTER TABLE units RENAME TO units_store');
    await storage.execute('CREATE VIEW units AS SELECT * FROM units_store');
    await storage.execute('CREATE TRIGGER update_units INSTEAD OF UPDATE ON units BEGIN UPDATE units_store SET name=NEW.name,kind=NEW.kind,active=NEW.active,revision=NEW.revision,updatedBy=NEW.updatedBy,updatedOn=NEW.updatedOn,_metadata=NEW._metadata WHERE id=OLD.id; END');
    await saveWorkforce('unit',{name:'Updated through view',kind:'unit',active:true},f.adminContext,f.unit);
    const current=await findRecord<typeof f.unit>('unit',f.unit.id);expect(current?.name).toBe('Updated through view');expect(current?.revision).toBe(2);
    const write=storage.db.writeTransaction;storage.db.writeTransaction=async(callback)=>{
      await storage.execute('UPDATE units_store SET revision=3,name=? WHERE id=?',['Other window update',f.unit.id]);return write(callback);
    };
    await expect(saveWorkforce('unit',{name:'Stale proposal',kind:'unit',active:true},f.adminContext,current)).rejects.toThrow(/changed/);
    expect((await findRecord<typeof f.unit>('unit',f.unit.id))?.name).toBe('Other window update');
  });
  it('attributes care to the accepted worker and service and rejects a merely administrative account', async () => {
    const f = await setup();
    const save = { patientId: 'WF-PHC-000001-A1', step: 'vitals' as const, values: { pulseBpm: 80 } };
    const entry = await saveStep(save, f.nurseContext);
    expect(entry.actorContext?.authoritySnapshotId).toBe(f.nurseProof.id);
    expect(entry.createdBy).toBe(f.nurse.id);
    await expect(saveStep({ ...save, encounterId: entry.encounterId, values: { pulseBpm: 81 } }, f.adminContext)).rejects.toThrow(/approval/);
  });
  it('retains an unsigned bundle, requires an independent witness, and retries the exact original IDs and authorship', async () => {
    const f = await setup(true), save = { patientId: 'WF-PHC-000001-A1', step: 'vitals' as const, values: { pulseBpm: 80 } };
    await expect(saveStep(save, f.nurseContext)).rejects.toThrow(/co-signature/);
    expect(await allOfType('encounter')).toHaveLength(0);
    expect(await allOfType('encounter_entry')).toHaveLength(0);
    const [bundle] = await listClinicalReviews(f.checkerContext);
    expect(bundle).toBeDefined();
    await expect(acknowledgeClinicalReview(bundle, f.nurseContext, 'supervisor')).rejects.toThrow(/different/);
    await acknowledgeClinicalReview(bundle, f.checkerContext, 'supervisor');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const entry = await saveStep(save, f.nurseContext);
    expect(entry.id).toBe(bundle.sourceId);
    expect(entry.createdBy).toBe(f.nurse.id);
    expect(await allOfType('encounter')).toHaveLength(1);
    expect(await listClinicalReviews(f.checkerContext)).toHaveLength(0);
  });
  it('does not reuse a witness acknowledgement for changed clinical content', async () => {
    const f = await setup(true), save = { patientId: 'WF-PHC-000001-A1', step: 'vitals' as const, values: { pulseBpm: 80 } };
    await expect(saveStep(save, f.nurseContext)).rejects.toThrow();
    const [bundle] = await listClinicalReviews(f.checkerContext);
    await acknowledgeClinicalReview(bundle, f.checkerContext, 'supervisor');
    await expect(saveStep({ ...save, values: { pulseBpm: 81 } }, f.nurseContext)).rejects.toThrow(/co-signature/);
    expect(await allOfType('encounter_entry')).toHaveLength(0);
  });
  it('resumes a finite occurrence without duplicates and refuses different details under its identity', async () => {
    const f = await setup(), now = Date.now(), assignment = await saveWorkforce('staff_assignment', { staffId: f.nurse.id, offeringId: f.offering.id, locationIds: [f.location.id], duty: 'member', requiredActions: ['assess'], startsAt: new Date(now - 60000).toISOString(), endsAt: new Date(now + 86400000).toISOString(), status: 'active', temporaryCover: false }, f.adminContext);
    const fields = { offeringId: f.offering.id, timeZone: 'Africa/Lagos', startsAt: new Date(now + 3600000).toISOString(), endsAt: new Date(now + 7200000).toISOString(), status: 'published', participants: [{ staffId: f.nurse.id, assignmentId: assignment.id, commitment: 'exclusive' }], resources: [{ locationId: f.location.id, mode: 'exclusive', units: 1 }], rosterShiftIds: [], seriesId: 'series:synthetic' };
    await saveWeeklyOccurrence(fields, f.adminContext, 'series:synthetic', 0);
    await saveWeeklyOccurrence(fields, f.adminContext, 'series:synthetic', 0);
    expect(await allOfType('service_session')).toHaveLength(1);
    await expect(saveWeeklyOccurrence({ ...fields, maxAppointments: 9 }, f.adminContext, 'series:synthetic', 0)).rejects.toThrow(/different details/);
  });
  it('binds selected care service to the staff identity on the shared device', async () => { const f = await setup(); await selectCareService(f.nurseContext, f.offering.id); await expect(saveStep({ patientId: 'WF-PHC-000001-A1', step: 'vitals', values: { pulseBpm: 80 } }, f.adminContext)).rejects.toThrow(); });
  it('changes resources on the same arrived booking without changing its attendance, time or fees',async()=>{
    const f=await setup(),now=Date.now();
    const allocation={offeringId:f.offering.id,endsAt:new Date(now+7200000).toISOString(),locations:[{locationId:f.location.id,units:1}]};
    const scheduledFor=new Date(now+3600000).toISOString();
    const booking=Appointment.parse({...f.env,id:'appointment:resources',type:'appointment',patientId:'WF-PHC-000001-A1',reason:'Synthetic visit',scheduledFor:new Date(now+3600000).toISOString(),status:'scheduled',attendance:'arrived',activity:[{id:'action:arrived',action:'arrived',fromAttendance:'booked',toAttendance:'arrived',fromScheduledFor:scheduledFor,toScheduledFor:scheduledFor,recordedBy:f.admin.id,recordedOn:new Date(now).toISOString()}],allocation,chargeIds:['charge:existing']});await storage.seed(booking);
    const changed=await reallocateAppointment(booking.id,undefined,booking.allocation,f.adminContext);
    expect(changed.id).toBe(booking.id);expect(changed.attendance).toBe('arrived');expect(changed.scheduledFor).toBe(booking.scheduledFor);expect(changed.chargeIds).toEqual(booking.chargeIds);expect(changed.activity).toEqual(booking.activity);expect(changed.allocation).toBeUndefined();
    await expect(reallocateAppointment(booking.id,allocation,booking.allocation,f.adminContext)).rejects.toThrow(/changed/);expect(await allOfType('charge')).toHaveLength(0);
  });
  it('normalizes envelope instants while preserving literal clinical note content in acknowledgement digests', async () => {
    const original = { createdOn: '2026-10-29T11:00:00+01:00', values: { note: '2026-10-29T11:00:00+01:00' } };
    expect(await clinicalPayloadHash(original)).toBe(await clinicalPayloadHash({ ...original, createdOn: '2026-10-29T10:00:00.000Z' }));
    expect(await clinicalPayloadHash(original)).not.toBe(await clinicalPayloadHash({ ...original, values: { note: '2026-10-29T10:00:00.000Z' } }));
  });
  it('converts service-local overnight times and handles daylight-saving gaps and repeated times explicitly', () => {
    expect(zonedInstant('2026-10-29T23:30', 'Africa/Lagos')).toBe('2026-10-29T22:30:00.000Z');
    expect(zonedInput('2026-10-30T01:00:00Z', 'Africa/Lagos')).toBe('2026-10-30T02:00');
    expect(() => zonedInstant('2026-03-08T02:30', 'America/New_York')).toThrow(/does not exist/);
    expect(() => zonedInstant('2026-11-01T01:30', 'America/New_York')).toThrow(/occurs twice/);
    expect(zonedInstant('2026-11-01T01:30', 'America/New_York', 'earlier')).not.toBe(zonedInstant('2026-11-01T01:30', 'America/New_York', 'later'));
  });
  it('keeps existing care available throughout preparation, even with a selected service and no clinical grant', async () => { const f = await setup(); await storage.execute('UPDATE facilities SET workforcePolicy = ? WHERE id = ?', [JSON.stringify({ ...f.facility.workforcePolicy, mode: 'preparation' }), f.facility.id]); await selectCareService(f.adminContext, f.offering.id); const entry = await saveStep({ patientId: 'WF-PHC-000001-A1', step: 'vitals', values: { pulseBpm: 80 } }, f.adminContext); expect(entry.actorContext).toBeUndefined(); expect(entry.createdBy).toBe(f.admin.id); });
  it('does not restamp an already retained clinical report when preparation mode is restored',async()=>{
    const f=await setup(true),save={patientId:'WF-PHC-000001-A1',step:'vitals' as const,values:{pulseBpm:80}};
    await expect(saveStep(save,f.nurseContext)).rejects.toThrow(/co-signature/);const[bundle]=await listClinicalReviews(f.nurseContext);
    await storage.execute('UPDATE facilities SET workforcePolicy = ? WHERE id = ?',[JSON.stringify({...f.facility.workforcePolicy,mode:'preparation'}),f.facility.id]);
    await expect(saveStep(save,f.nurseContext)).rejects.toThrow(/historical/);expect(await allOfType('encounter_entry')).toHaveLength(0);expect((await listClinicalReviews(f.nurseContext))[0].sourceId).toBe(bundle.sourceId);
  });
});
