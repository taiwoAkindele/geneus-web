import {
  InpatientEvent, BedReadyEvent, admissionRequest, bedReadyIssues, inpatientIssues, inpatientHeads, activeAdmission,
  usableInpatientEvents, type InpatientAction, type AnyDocument, type DocType, type Encounter, type EncounterEntry,
  type Location, type Unit, type AuthorizationContext, type SyncRejection, type PatientIdentityEvent,
} from '@shared';
import { assertAllowed } from '@/auth/authorization';
import { allOfType, envelope, insertRecord, newId, findRecord } from '../db';
import { getDatabase, type LocalDatabase } from '../database';
import { fieldKindsFor } from '../contractShape';
import { fromRow, type Row } from '../rows';
import { TABLE_FOR } from '../tables';
import { inpatientSupported } from '../inpatientSupport';
import { listWorkforceReceipts } from './workforceReceipts';
import { pendingWorkforceIds } from './workforce';
import { listStaff } from './staff';

type Reader = Pick<LocalDatabase, 'getOptional'>;
/** PowerSync transactions expose getOptional; aggregate rows so checks share the insertion's write lock. */
const recordsUnderLock = async <T extends AnyDocument>(reader: Reader, type: DocType): Promise<T[]> => {
  const fields = Object.keys(fieldKindsFor(type)).filter((field) => field !== 'type');
  const row = await reader.getOptional<{ records: string }>(`SELECT json_group_array(json_object(${fields.map((field) => `'${field}', "${field}"`).join(', ')})) AS records FROM ${TABLE_FOR[type]}`);
  return (JSON.parse(row?.records ?? '[]') as Row[]).map((record) => fromRow<T>(type, record));
};
const records = async (reader?: Reader, candidate?: InpatientEvent | BedReadyEvent) => {
  const read = <T extends AnyDocument>(type: DocType) => reader ? recordsUnderLock<T>(reader, type) : allOfType<T>(type);
  const source = async <T extends AnyDocument>(type: DocType, id: string): Promise<T[]> => {
    if (!reader) { const record = await findRecord<T>(type, id); return record ? [record] : []; }
    const row = await reader.getOptional<Row>(`SELECT * FROM ${TABLE_FOR[type]} WHERE id = ?`, [id]);
    return row ? [fromRow<T>(type, row)] : [];
  };
  const admissionSources = async () => (await getDatabase().getAll<Row>(`SELECT * FROM encounter_entries WHERE step = 'admission' OR (step = 'disposition' AND json_extract("values", '$.kind') = 'admission')`)).map((row) => fromRow<EncounterEntry>('encounter_entry', row)).filter(admissionRequest);
  const [events, ready, locations, units, encounters, entries, rejections, identities] = await Promise.all([
    read<InpatientEvent>('inpatient_event'), read<BedReadyEvent>('bed_ready_event'), read<Location>('location'), read<Unit>('unit'),
    candidate?.type === 'inpatient_event' ? source<Encounter>('encounter', candidate.encounterId) : Promise.resolve([]),
    candidate?.type === 'inpatient_event' ? source<EncounterEntry>('encounter_entry', candidate.requestEntryId) : candidate ? Promise.resolve([]) : admissionSources(),
    read<SyncRejection>('sync_rejection'),
    read<PatientIdentityEvent>('patient_identity_event'),
  ]);
  const rejected = new Set(rejections.filter((item) => ['inpatient_event','bed_ready_event'].includes(item.entityType)).map((item) => item.entityId));
  // Receipts outlive the visible reconciliation item, including after it is marked resolved.
  const receipts = reader ? await reader.getOptional<{ records: string }>('SELECT json_group_array(json_object(\'id\',id,\'outcome\',outcome)) AS records FROM workforce_upload_receipts').then((row) => JSON.parse(row?.records ?? '[]') as { id: string; outcome: string }[]) : await listWorkforceReceipts();
  for (const receipt of receipts) if (receipt.outcome === 'rejected') rejected.add(receipt.id);
  const usable = usableInpatientEvents(events, rejected);
  return { events: usable, ready: ready.filter((event) => !rejected.has(event.id) && usable.some((item) => item.id === event.releaseEventId)), locations, units, encounters, entries, rejections, rejected, identities };
};
export const loadInpatient = async () => {
  const [data, pending, staff] = await Promise.all([records(), pendingWorkforceIds(), listStaff()]);
  const heads = inpatientHeads(data.events);
  const handled = new Set(data.events.map((event) => event.requestEntryId));
  return { ...data, pending, staff, heads, active: heads.filter(activeAdmission), requests: data.entries.filter((entry) => admissionRequest(entry) && !handled.has(entry.id)) };
};
export type InpatientData = Awaited<ReturnType<typeof loadInpatient>>;
const assertSupport = (context: AuthorizationContext) => {
  assertAllowed(context, 'admission:manage');
  if (!inpatientSupported(context)) throw new Error('Connect once to confirm this server supports admissions before recording ward work');
};
export const confirmAdmission = async (request: EncounterEntry, receivingUnitId: string, note: string, context: AuthorizationContext) => {
  assertSupport(context);
  const id = newId('inpatient_event');
  const event = InpatientEvent.parse({ ...envelope(context), id, type: 'inpatient_event', admissionId: id, patientId: request.patientId,
    encounterId: request.encounterId, requestEntryId: request.id, action: 'confirm', receivingUnitId, actorRole: context.role, note: note.trim() || undefined });
  return writeEvent(event, context);
};
export const changeAdmission = async (previous: InpatientEvent, action: Exclude<InpatientAction, 'confirm'>, context: AuthorizationContext, changes: { wardId?: string; bedId?: string; receivingUnitId?: string; note?: string } = {}) => {
  assertSupport(context);
  const event = InpatientEvent.parse({ ...previous, ...envelope(context), id: newId('inpatient_event'), previousId: previous.id, action,
    actorRole: context.role, note: changes.note?.trim() || undefined,
    wardId: changes.wardId ?? previous.wardId, bedId: changes.bedId ?? previous.bedId, receivingUnitId: changes.receivingUnitId ?? previous.receivingUnitId });
  return writeEvent(event, context);
};
const writeEvent = (event: InpatientEvent, context: AuthorizationContext) => insertRecord<InpatientEvent>(context, 'admission:manage', 'inpatient_event', event, {
  checkUnderLock: async (transaction) => {
    const data = await records(transaction, event);
    const issues = inpatientIssues(event, data);
    if (issues.length) throw new Error(issues.join('. '));
  },
});
export const confirmBedReady = async (bedId: string, releaseEventId: string, context: AuthorizationContext) => {
  assertSupport(context);
  const event = BedReadyEvent.parse({ ...envelope(context), id: newId('bed_ready_event'), type: 'bed_ready_event', bedId, releaseEventId, actorRole: context.role });
  return insertRecord<BedReadyEvent>(context, 'admission:manage', 'bed_ready_event', event, { checkUnderLock: async (transaction) => {
    const issues = bedReadyIssues(event, await records(transaction, event));
    if (issues.length) throw new Error(issues.join('. '));
  } });
};
