import type { DocType, RejectionCategory, SyncRejection } from '@shared';

/** What was refused, in the words staff use. */
export const RECORD_LABEL: Partial<Record<DocType, string>> = {
  patient: 'Patient',
  encounter: 'Encounter',
  encounter_entry: 'Encounter step',
  handoff: 'Unit handoff',
  appointment: 'Appointment',
  register_entry: 'Register entry',
  register_definition: 'Register',
  referral: 'Referral',
  stock_item: 'Stock item',
  stock_movement: 'Stock movement',
  unit: 'Unit',
  staff: 'Staff member',
  roster_shift: 'Shift',
  audit_event: 'Activity record',
};

/** Why, in one line a records officer can act on. */
export const CATEGORY_LABEL: Record<RejectionCategory, string> = {
  conflict: 'Changed on another device first',
  authorization: 'Not allowed for the person who saved it',
  identity: 'Device or staff member not recognised',
  validation: 'The record was not valid',
};

export type RejectionKind =
  /** Two devices changed the same field: choose which value stands. */
  | 'column_conflict'
  /** A patient registration lost its Patient ID to another device's. */
  | 'patient_id_clash'
  /** Held back with a patient's refused registration, still open above — resolved together with it. */
  | 'held'
  /** Any other refused write that was kept: apply it again, or discard it. */
  | 'refused_write'
  /** Nothing was kept to apply (a refused delete): it can only be discarded. */
  | 'nothing_kept';

const isPatientIdClash = (rejection: SyncRejection) =>
  rejection.category === 'conflict' && rejection.entityType === 'patient' && rejection.operation === 'put' && Boolean(rejection.refusedRecord);

/**
 * Every refusal is a decision for a person (SCHEMA.md §7) — this says which.
 * A held record stays with its patient only while that patient's clash is
 * still open; once that is resolved or discarded it is decided on its own.
 */
export const kindOf = (rejection: SyncRejection, open: readonly SyncRejection[] = []): RejectionKind => {
  if (rejection.reason.startsWith('held:')) {
    const patientId = rejection.entityType === 'patient' ? rejection.entityId : rejection.refusedRecord?.patientId;
    const clashOpen = open.some(
      (candidate) => isPatientIdClash(candidate) && candidate.entityId === patientId && candidate.deviceId === rejection.deviceId,
    );
    if (clashOpen) return 'held';
  }
  if (rejection.category === 'conflict' && rejection.conflicts?.length) return 'column_conflict';
  if (isPatientIdClash(rejection)) return 'patient_id_clash';
  return rejection.refusedRecord || rejection.refusedChanges ? 'refused_write' : 'nothing_kept';
};

/** Fields every record carries that say nothing about what was written. */
const BOOKKEEPING = new Set(['id', 'type', 'facilityId', 'schemaVersion', 'createdBy', 'createdOn', 'deviceId', 'updatedBy', 'updatedOn']);

/** What a refused write contained, as label/value rows — so it is read before it is applied or discarded. */
export const keptRows = (rejection: SyncRejection): { label: string; value: string }[] =>
  Object.entries(rejection.refusedChanges ?? rejection.refusedRecord ?? {})
    .filter(([field, value]) => !BOOKKEEPING.has(field) && value !== undefined && value !== null && value !== '')
    .map(([field, value]) => ({ label: field, value: shownValue(value) }));

/** A value from either side of a conflict, shown plainly. */
export const shownValue = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};
