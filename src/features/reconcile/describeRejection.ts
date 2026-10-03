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
  /** Held back because its patient's registration was refused — resolved with that patient. */
  | 'held'
  /** Anything else: read it, act outside the queue if needed, then mark it reviewed. */
  | 'review';

export const kindOf = (rejection: SyncRejection): RejectionKind => {
  if (rejection.reason.startsWith('held:')) return 'held';
  if (rejection.category === 'conflict' && rejection.conflicts?.length) return 'column_conflict';
  if (
    rejection.category === 'conflict' &&
    rejection.entityType === 'patient' &&
    rejection.operation === 'put' &&
    rejection.refusedRecord
  ) {
    return 'patient_id_clash';
  }
  return 'review';
};

/** A value from either side of a conflict, shown plainly. */
export const shownValue = (value: unknown): string => {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.join(', ') || '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};
