import { isHighRisk, type AuthorizationContext, type DocType, type Patient, type Permission, type SyncRejection } from '@shared';
import { assertAllowed } from '@/auth/authorization';
import { mintPatientId } from '@/lib/patientId';
import { allOfType, findRecord, insertRecords, newId, nowIso, updateRecord, type NewRecord } from '../db';
import { listPatients } from './patients';

/**
 * The records officer's reconcile queue (SCHEMA.md §7): every upload the
 * server refused, synced back down. No refused write is lost: each one waits
 * here until a person applies it again or discards it, and either decision is
 * recorded on the rejection in their name (`resolvedBy`, `resolution`) — the
 * only change a device may make to one.
 */

export const listOpenRejections = async (): Promise<SyncRejection[]> =>
  (await allOfType<SyncRejection>('sync_rejection'))
    .filter((rejection) => !rejection.resolvedOn)
    .sort((a, b) => b.createdOn.localeCompare(a.createdOn));

export const resolveRejection = (rejection: SyncRejection, resolution: string, context: AuthorizationContext) =>
  updateRecord<SyncRejection>(context, 'sync_rejection:resolve', 'sync_rejection', rejection.id, {
    resolvedOn: nowIso(),
    resolvedBy: context.userId,
    resolution,
  });

/** The permission that changes each record a column conflict can arise on (SCHEMA.md §7). */
const UPDATE_PERMISSION: Partial<Record<DocType, Permission>> = {
  patient: 'patient:update',
  handoff: 'handoff:update',
  referral: 'referral:update',
  stock_item: 'stock_item:manage',
  unit: 'unit:manage',
};

/** What creating each kind of record needs — the same rule the record's own screen applies. */
const CREATE_PERMISSION: Partial<Record<DocType, Permission>> = {
  patient: 'patient:create',
  visit: 'visit:create',
  encounter: 'encounter:record',
  encounter_entry: 'encounter:record',
  handoff: 'handoff:create',
  appointment: 'appointment:create',
  register_definition: 'register_definition:publish',
  register_entry: 'register_entry:create',
  referral: 'referral:create',
  stock_item: 'stock_item:manage',
  stock_movement: 'stock_movement:create',
  unit: 'unit:manage',
  staff: 'staff:manage',
  roster_shift: 'roster:assign',
};

/** A staff or shift change needs the permission its columns need (as the server decides it). */
const changePermission = (type: DocType, changes: Record<string, unknown>): Permission | undefined => {
  const columns = Object.keys(changes);
  if (type === 'staff') {
    if (columns.includes('permission')) return 'staff:permission';
    if (changes.active === false) return 'staff:deactivate';
    return 'staff:manage';
  }
  if (type === 'roster_shift') return columns.every((column) => column === 'extendedUntil') ? 'roster:extend' : 'roster:assign';
  return UPDATE_PERMISSION[type];
};

/** The permission applying this refused write again needs, or undefined when it cannot be applied again. */
const permissionToApply = (rejection: SyncRejection): Permission | undefined => {
  if (rejection.operation === 'put' && rejection.refusedRecord) return CREATE_PERMISSION[rejection.entityType];
  if (rejection.operation === 'patch' && rejection.refusedChanges) return changePermission(rejection.entityType, rejection.refusedChanges);
  return undefined;
};

/**
 * Why this person cannot apply the refused write again, in words they can act
 * on — or undefined when they can. Applying needs the record's own permission
 * as well as the right to resolve, because the write is applied in their name.
 */
export const applyAgainBlocker = (rejection: SyncRejection, context: AuthorizationContext): string | undefined => {
  if (!rejection.refusedRecord && !rejection.refusedChanges) return 'Nothing was kept to apply again — this can only be discarded.';
  const permission = permissionToApply(rejection);
  if (!permission) return 'This kind of record cannot be applied again from here.';
  if (!context.permissions.includes('sync_rejection:resolve')) return 'A records officer or facility admin resolves this.';
  if (!context.permissions.includes(permission)) return 'Your role cannot make this change — someone whose role can must apply it again.';
  return undefined;
};

/**
 * Writes a refused insert or change again, in the name of the person applying
 * it — the original author may no longer be accepted (deactivated while the
 * device was offline), and whoever applies it vouches for it. The rejection
 * keeps who first recorded it and when (`attributedTo`, `occurredOn`). An
 * insert keeps its first time, except a high-risk one, which the server only
 * accepts within 24 hours of being made.
 */
export const applyAgain = async (rejection: SyncRejection, context: AuthorizationContext): Promise<void> => {
  const blocker = applyAgainBlocker(rejection, context);
  const permission = permissionToApply(rejection);
  if (blocker || !permission) throw new Error(blocker ?? 'This cannot be applied again');
  assertAllowed(context, 'sync_rejection:resolve');
  assertAllowed(context, permission);
  const type = rejection.entityType;

  if (rejection.operation === 'put' && rejection.refusedRecord) {
    if (await findRecord(type, rejection.entityId)) {
      throw new Error('This record is already on the device — it may still be syncing. Try again in a moment.');
    }
    const { updatedBy: _updatedBy, updatedOn: _updatedOn, ...original } = rejection.refusedRecord;
    const record = {
      ...original,
      type,
      id: rejection.entityId,
      createdBy: context.userId,
      createdOn: isHighRisk(permission) || typeof original.createdOn !== 'string' ? nowIso() : original.createdOn,
      deviceId: context.deviceId,
      ...(type === 'encounter_entry' ? { actorRole: context.role } : {}),
    };
    await insertRecords(context, [{ permission, type, record }]);
  } else if (rejection.refusedChanges) {
    if (!(await findRecord(type, rejection.entityId))) {
      throw new Error('The record this changes is not on this device — apply or discard its creation first.');
    }
    await updateRecord(context, permission, type, rejection.entityId, rejection.refusedChanges);
  }
  await resolveRejection(rejection, 'Applied again', context);
};

/** Throws the refused write away — recorded in this person's name, never silently. */
export const discardRejection = (rejection: SyncRejection, context: AuthorizationContext) =>
  resolveRejection(rejection, 'Discarded', context);

/** Puts this device's values back over the server's, for the columns chosen, then closes the rejection. */
export const applyDeviceValues = async (rejection: SyncRejection, columns: readonly string[], context: AuthorizationContext) => {
  const permission = UPDATE_PERMISSION[rejection.entityType];
  if (!permission) throw new Error(`${rejection.entityType} changes cannot be re-applied here`);
  // Both writes are checked before the first: a person who may edit the record
  // but not reconcile must not leave the value changed and the rejection open.
  assertAllowed(context, 'sync_rejection:resolve');
  assertAllowed(context, permission);
  const chosen = (rejection.conflicts ?? []).filter((conflict) => columns.includes(conflict.column));
  const changes = Object.fromEntries(chosen.map((conflict) => [conflict.column, conflict.deviceValue]));
  await updateRecord(context, permission, rejection.entityType, rejection.entityId, changes);
  await resolveRejection(rejection, `Kept this device's ${chosen.map((conflict) => conflict.column).join(', ')}`, context);
};

/**
 * Records this device sent for a patient whose registration it lost to an ID
 * clash — the server held them in the queue rather than attach them to the
 * patient who took the ID first (SCHEMA.md §7).
 */
export const heldFor = (patientRejection: SyncRejection, open: readonly SyncRejection[]): SyncRejection[] =>
  open.filter(
    (rejection) =>
      rejection.id !== patientRejection.id &&
      rejection.deviceId === patientRejection.deviceId &&
      rejection.operation === 'put' &&
      rejection.refusedRecord?.patientId === patientRejection.entityId,
  );

/** Edits this device made to the patient whose registration it lost — held with it, carried onto the restored record. */
export const heldEditsFor = (patientRejection: SyncRejection, open: readonly SyncRejection[]): SyncRejection[] =>
  open.filter(
    (rejection) =>
      rejection.id !== patientRejection.id &&
      rejection.deviceId === patientRejection.deviceId &&
      rejection.operation === 'patch' &&
      rejection.entityType === 'patient' &&
      rejection.entityId === patientRejection.entityId &&
      rejection.refusedChanges !== undefined,
  );

/** The refused registration with the held edits laid over it, in the order they were made. */
export const withHeldEdits = (patientRejection: SyncRejection, edits: readonly SyncRejection[]): SyncRejection => ({
  ...patientRejection,
  refusedRecord: [...edits]
    .sort((a, b) => (a.occurredOn ?? a.createdOn).localeCompare(b.occurredOn ?? b.createdOn))
    .reduce<Record<string, unknown>>((record, edit) => ({ ...record, ...edit.refusedChanges }), patientRejection.refusedRecord ?? {}),
});

/** Within one moment, a record goes before the records that point at it. */
const TYPE_ORDER: Partial<Record<string, number>> = { patient: 0, encounter: 1, appointment: 2, encounter_entry: 3, handoff: 4 };

const LINKS = ['encounterId', 'amends'] as const;

/**
 * The refused registration and everything held with it, rewritten for the new
 * Patient ID: every record gets a fresh id, every link between them follows,
 * and each is stamped with this device so the server will take it. Author and
 * time stay as first recorded — the action keeps its name (PRD §9.8.5).
 */
export const planRestore = (
  patientRejection: SyncRejection,
  held: readonly SyncRejection[],
  newPatientId: string,
  deviceId: string,
  mintId: (type: DocType) => string = newId,
): { type: DocType; record: Record<string, unknown> }[] => {
  const patient = patientRejection.refusedRecord;
  if (!patient) throw new Error('this rejection kept no record to restore');

  const records = held
    .map((rejection) => ({ type: rejection.entityType, record: rejection.refusedRecord ?? {} }))
    .sort(
      (a, b) =>
        String(a.record.createdOn).localeCompare(String(b.record.createdOn)) ||
        (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9),
    );
  const renamed = new Map<string, string>([[patientRejection.entityId, newPatientId]]);
  for (const { type, record } of records) renamed.set(String(record.id), mintId(type));

  const relink = (value: unknown) => (typeof value === 'string' ? (renamed.get(value) ?? value) : value);

  return [
    { type: 'patient' as DocType, record: { ...patient, id: newPatientId, patientId: newPatientId, deviceId } },
    ...records.map(({ type, record }) => {
      const restored: Record<string, unknown> = { ...record, id: renamed.get(String(record.id)), patientId: newPatientId, deviceId };
      for (const link of LINKS) if (restored[link] !== undefined) restored[link] = relink(restored[link]);
      const values = restored.values as Record<string, unknown> | undefined;
      if (values?.appointmentId) restored.values = { ...values, appointmentId: relink(values.appointmentId) };
      return { type, record: restored };
    }),
  ];
};

/**
 * Re-registers a patient refused for an ID clash under a newly minted ID and
 * restores what was held with them, then closes every rejection involved. The
 * restore is a reconciliation, so it needs `sync_rejection:resolve`; the server
 * still checks each record's own author may have made it.
 */
export const reRegisterPatient = async (
  patientRejection: SyncRejection,
  open: readonly SyncRejection[],
  context: AuthorizationContext,
): Promise<Patient> => {
  const held = heldFor(patientRejection, open);
  const edits = heldEditsFor(patientRejection, open);
  const patients = await listPatients();
  const newPatientId = mintPatientId(context.facilityId, patients.map((patient) => patient.patientId));
  const plan = planRestore(withHeldEdits(patientRejection, edits), held, newPatientId, context.deviceId);

  const records: NewRecord[] = plan.map(({ type, record }) => ({ permission: 'sync_rejection:resolve', type, record }));
  const [patient] = (await insertRecords(context, records)) as [Patient];

  const resolution = `Re-registered as ${newPatientId}`;
  for (const rejection of [patientRejection, ...held, ...edits]) await resolveRejection(rejection, resolution, context);
  return patient;
};
