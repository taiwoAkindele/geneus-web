import { column, Schema, Table, type ColumnsType, type IndexShorthand } from '@powersync/web';
import type { DocType } from '@shared';
import { fieldKindsFor, type FieldKind } from './contractShape';
import { DRAFTS_TABLE, REGISTER_DRAFTS_TABLE, WORKFORCE_DRAFTS_TABLE, WORKFORCE_RECEIPTS_TABLE, CLINICAL_REVIEWS_TABLE, TABLE_FOR } from './tables';

/**
 * The local SQLite schema, derived from the shared contract: one table per
 * record type (tables.ts), columns matching the contract field for field.
 * PowerSync adds `id` itself.
 */
/**
 * What the screens look records up by. Kept explicit: an index is a cost on a
 * cheap phone, so each one names the query it serves.
 */
const INDEXES: Partial<Record<DocType, IndexShorthand>> = {
  patient: { name: ['fullName'], phone: ['phone'], folder: ['legacyPaperRef'], nin: ['nin'] },
  patient_identity_event: { patient: ['patientId'], other: ['otherPatientId'] },
  appointment: { patient: ['patientId'], scheduled: ['scheduledFor'] },
  charge: { patient: ['patientId'], appointment: ['appointmentId'] },
  payment: { patient: ['patientId'], transfer: ['incomingTransferId'] },
  billing_adjustment: { charge: ['chargeId'], patient: ['patientId'] },
  incoming_transfer: { patient: ['patientId'] },
  encounter: { patient: ['patientId'] },
  handoff: { toUnit: ['toUnitId'], patient: ['patientId'] },
  encounter_entry: { encounter: ['encounterId'], patient: ['patientId'], step: ['step'] },
  clinical_event: { patient: ['patientId'], record: ['recordId'], kind: ['kind'] },
  register_definition: { register: ['registerId'] },
  register_entry: { register: ['registerId'], patient: ['patientId'] },
  roster_shift: { staff: ['staffId'] },
  sync_rejection: { open: ['resolvedOn'] },
  audit_event: { source: ['entityId'] },
  pin_setup_code: { staff: ['staffId'] },
  service_offering: { unit: ['unitId'] },
  practitioner_profile: { staff: ['staffId'] },
  authority_snapshot: { staff: ['staffId'] },
  staff_assignment: { staff: ['staffId'], offering: ['offeringId'] },
  service_session: { offering: ['offeringId'], starts: ['startsAt'] },
  session_event: { offering: ['offeringId'] },
  work_ownership_event: { source: ['sourceId'] },
  appointment_reservation: { booking: ['appointmentId'] },
};

const COLUMN_FOR: Record<FieldKind, typeof column.text> = {
  text: column.text,
  json: column.text,
  boolean: column.integer,
  number: column.real,
};

const tableFor = (type: DocType): Table => {
  const columns: ColumnsType = {};
  for (const [field, kind] of Object.entries(fieldKindsFor(type))) {
    if (field === 'id') continue;
    columns[field] = COLUMN_FOR[kind];
  }
  return new Table(columns, {
    indexes: INDEXES[type] ?? {},
    // Previous values ride along with each local change, so the server can tell
    // "both devices changed this column" from "only this one did" (SCHEMA.md §7).
    trackPrevious: { onlyWhenChanged: true },
    // A PATCH carries only the columns that changed, so a second edit by the same
    // person would omit `updatedBy`. The actor rides in PowerSync's per-write
    // metadata instead, and the connector restores it (db.ts, connector.ts).
    trackMetadata: true,
  });
};

/** One unsaved section per staff member, patient, encounter and step (repos/drafts.ts). */
const draftsTable = new Table(
  { staffId: column.text, patientId: column.text, encounterKey: column.text, step: column.text, data: column.text, updatedOn: column.text },
  { localOnly: true, indexes: { owner: ['staffId', 'patientId', 'encounterKey'] } },
);

export const AppSchema = new Schema({
  ...Object.fromEntries((Object.keys(TABLE_FOR) as DocType[]).map((type) => [TABLE_FOR[type], tableFor(type)])),
  [DRAFTS_TABLE]: draftsTable,
  [WORKFORCE_DRAFTS_TABLE]: new Table({ staffId:column.text, deviceId:column.text, slot:column.text, data:column.text, updatedOn:column.text }, { localOnly:true, indexes:{owner:['staffId','deviceId','slot']} }),
  [WORKFORCE_RECEIPTS_TABLE]: new Table({ clientId:column.integer, outcome:column.text }, {localOnly:true}),
  [CLINICAL_REVIEWS_TABLE]: new Table({ facilityId:column.text, staffId:column.text, semanticKey:column.text, data:column.text }, {localOnly:true,indexes:{owner:['staffId']}}),
  [REGISTER_DRAFTS_TABLE]: new Table(
    { staffId: column.text, registerKey: column.text, data: column.text, updatedOn: column.text },
    { localOnly: true, indexes: { owner: ['staffId', 'registerKey'] } },
  ),
});
