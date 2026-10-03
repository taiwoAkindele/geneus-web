import type { AuthorizationContext, DocType, Patient, Permission, SyncRejection } from '@shared';
import { assertAllowed } from '@/auth/authorization';
import { mintPatientId } from '@/lib/patientId';
import { allOfType, insertRecords, newId, nowIso, updateRecord, type NewRecord } from '../db';
import { listPatients } from './patients';

/**
 * The records officer's reconcile queue (SCHEMA.md §7): every upload the
 * server refused, synced back down. A rejection is closed by marking it
 * resolved — the only change a device may make to one — after acting on it.
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
};

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
  const patients = await listPatients();
  const newPatientId = mintPatientId(context.facilityId, patients.map((patient) => patient.patientId));
  const plan = planRestore(patientRejection, held, newPatientId, context.deviceId);

  const records: NewRecord[] = plan.map(({ type, record }) => ({ permission: 'sync_rejection:resolve', type, record }));
  const [patient] = (await insertRecords(context, records)) as [Patient];

  const resolution = `Re-registered as ${newPatientId}`;
  for (const rejection of [patientRejection, ...held]) await resolveRejection(rejection, resolution, context);
  return patient;
};
