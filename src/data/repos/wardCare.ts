import { WardCareEvent, Encounter, EncounterEntry, usableInpatientEvents, careEntryIssues, wardEntryIssues, wardEventIssues, wardSessionIssues, wardClinicalActions, CLINICAL_ACTION_PERMISSIONS, effectiveEncounterEntries, medicationHeads, dischargeHeads, type AnyDocument, type AuthorizationContext, type DocType, type InpatientEvent, type WardCareValues, type WardRecords, type PrescriptionLine, type Patient, type LabReport } from '@shared';
import { assertAllowed } from '@/auth/authorization';
import type { LocalDatabase } from '../database';
import { allOfType, envelope, insertRecords, newId, type NewRecord } from '../db';
import { fieldKindsFor } from '../contractShape';
import { fromRow, type Row } from '../rows';
import { TABLE_FOR } from '../tables';
import { wardCareSupported } from '../wardCareSupport';
import { labReportSaveIssues } from './resultTemplates';
import { bookingRecords } from './appointments';
import { newCharge, patientBillingFacts } from './billing';
import type { FeeItem, InvestigationItem } from '@shared';
import { activeAdmission, clinicalRecordActions, wardAdmission } from '@shared';
import { retainClinicalDraftForReview } from './clinicalReviews';
import { activeWorkspace } from '../facilityWorkspaces';

type Reader = Pick<LocalDatabase, 'getOptional'>;
export const readWardRecords = async (admissionId: string, reader?: Reader): Promise<WardRecords> => {
  const read = async <T extends AnyDocument>(type: DocType): Promise<T[]> => {
    if (!reader) return allOfType<T>(type);
    const fields = Object.keys(fieldKindsFor(type)).filter((field) => field !== 'type');
    const row = await reader.getOptional<{ records: string }>(`SELECT json_group_array(json_object(${fields.map((field) => `'${field}', "${field}"`).join(', ')})) AS records FROM ${TABLE_FOR[type]}`);
    return (JSON.parse(row?.records ?? '[]') as Row[]).map((record) => fromRow<T>(type, record));
  };
  const [admissions, encounters, entries, events, rejected, receipts] = await Promise.all([
    read<InpatientEvent>('inpatient_event'), read<Encounter>('encounter'), read<EncounterEntry>('encounter_entry'), read<WardCareEvent>('ward_care_event'),
    read<Extract<AnyDocument, { type: 'sync_rejection' }>>('sync_rejection'),
    reader ? reader.getOptional<{ records: string }>(`SELECT json_group_array(json_object('id',id,'outcome',outcome)) AS records FROM workforce_upload_receipts`).then((r) => JSON.parse(r?.records ?? '[]') as { id: string; outcome: string }[]) : import('./workforceReceipts').then((m) => m.listWorkforceReceipts()),
  ]);
  const applied = new Set(receipts.filter((r) => r.outcome === 'applied').map((r) => r.id));
  const blocked = new Set([...rejected.filter((r) => !applied.has(r.entityId)).map((r) => r.entityId), ...receipts.filter((r) => r.outcome === 'rejected').map((r) => r.id)]);
  let changed = true;
  while (changed) {
    changed = false;
    const block = (id: string) => { if (!blocked.has(id)) { blocked.add(id); changed = true; } };
    for (const e of encounters) if (e.inpatientContext && blocked.has(e.inpatientContext.admissionId)) block(e.id);
    for (const e of entries) if (blocked.has(e.encounterId) || (e.amends && blocked.has(e.amends))) block(e.id);
    for (const e of events) { const v = e.values; if (blocked.has(e.encounterId) || ('previousId' in v && v.previousId && blocked.has(v.previousId)) || (v.kind === 'medication' && blocked.has(v.sourceEntryId)) || (v.kind === 'administration' && blocked.has(v.orderEventId))) block(e.id); }
    for (const e of admissions) if (blocked.has(e.requestEntryId)) block(e.id);
  }
  const usableAdmissions = usableInpatientEvents(admissions.filter((e) => e.admissionId === admissionId), blocked);
  const source = usableAdmissions.find((e) => e.id === admissionId)?.encounterId;
  const sessions = encounters.filter((e) => !blocked.has(e.id) && (e.id === source || e.inpatientContext?.admissionId === admissionId));
  const ids = new Set(sessions.map((e) => e.id));
  return { admissions: usableAdmissions, encounters: sessions, entries: entries.filter((e) => ids.has(e.encounterId) && !blocked.has(e.id)), events: events.filter((e) => e.admissionId === admissionId && ids.has(e.encounterId) && !blocked.has(e.id)) };
};
export const loadWardCare = async (admissionId: string, context: AuthorizationContext) => {
  assertAllowed(context, 'patient_chart:read');
  const workspace = activeWorkspace();
  if (workspace && (workspace.facilityId !== context.facilityId || workspace.deviceId !== context.deviceId)) throw new Error('Open ward care in the current hospital workspace');
  const data = await readWardRecords(admissionId);
  if (data.admissions.some((e) => e.facilityId !== context.facilityId)) throw new Error('This stay belongs to another hospital');
  return data;
};
export type WardSession = { id: string; admissionId: string; patientId: string; purpose: 'nursing' | 'review' | 'discharge' };
const headerFor = (session: WardSession, context: AuthorizationContext, at: string) => Encounter.parse({ ...envelope(context, at), id: session.id, type: 'encounter', workflowVersion: 1, patientId: session.patientId, openedOn: at, inpatientContext: { admissionId: session.admissionId, purpose: session.purpose } });
const assertSupport = (context: AuthorizationContext) => {
  assertAllowed(context, 'encounter:record');
  if (!wardCareSupported(context)) throw new Error('Connect once to confirm this server supports continuing ward care');
};
const ensureHeader = async (session: WardSession, context: AuthorizationContext, at: string): Promise<NewRecord[]> =>
  (await allOfType<Encounter>('encounter')).some((e) => e.id === session.id) ? [] : [{ permission: 'encounter:record', type: 'encounter', record: headerFor(session, context, at) }];

export const saveWardStep = async (session: WardSession, step: EncounterEntry['step'], values: Record<string, unknown>, context: AuthorizationContext, options: { performedOn?: string; lateReason?: string; labReport?: LabReport; changeOrder?: WardCareEvent } = {}) => {
  assertSupport(context);
  const at = new Date().toISOString(), data = await readWardRecords(session.admissionId);
  if (step === 'prescription') values = { ...values, prescription: (values.prescription as PrescriptionLine[]).map((line) => ({ ...line, lineId: line.lineId ?? `medication_line:${crypto.randomUUID()}` })) };
  const entry = EncounterEntry.parse({ ...envelope(context, at), id: newId('encounter_entry'), type: 'encounter_entry', workflowVersion: 1, encounterId: session.id, admissionId: session.admissionId,
    patientId: session.patientId, actorRole: context.role, step, values, performedOn: options.performedOn ?? at, lateReason: options.lateReason, labReport: options.labReport });
  for (const action of clinicalRecordActions(entry, entry.amends ? data.entries.find((e) => e.id === entry.amends) : undefined)) assertAllowed(context, CLINICAL_ACTION_PERMISSIONS[action]);
  if (entry.labReport) {
    const issues = await labReportSaveIssues(session.patientId, data.entries.filter((e) => e.encounterId === session.id), entry.labReport, entry.values.results as { test: string; result: string }[], at);
    if (issues.length) throw new Error(issues.join('. '));
  }
  const records: NewRecord[] = [...await ensureHeader(session, context, at), { permission: 'encounter:record', type: 'encounter_entry', record: entry }];
  if (step === 'prescription') {
    const lines = entry.values.prescription as PrescriptionLine[];
    if (options.changeOrder && lines.length !== 1) throw new Error('Change one existing order at a time');
    for (const line of lines) {
      const id = newId('ward_care_event'), before = options.changeOrder;
      records.push({ permission: 'encounter:record', type: 'ward_care_event', record: WardCareEvent.parse({ ...envelope(context, at), id, type: 'ward_care_event', admissionId: session.admissionId, encounterId: session.id, patientId: session.patientId, occurredOn: at,
        values: { kind: 'medication', orderId: before?.values.kind === 'medication' ? before.values.orderId : id, previousId: before?.id, action: before ? 'change' : 'start', sourceEntryId: entry.id, lineId: line.lineId! } }) });
    }
  }
  if (step === 'lab_order') {
    const patient = (await allOfType<Patient>('patient')).find((p) => p.id === session.patientId);
    if (!patient) throw new Error('The patient record is unavailable');
    const fees = await allOfType<FeeItem>('fee_item');
    for (const item of (values.items ?? []) as InvestigationItem[]) {
      if (!item.feeItemId) continue;
      const fee = fees.find((f) => f.id === item.feeItemId && f.active);
      if (!fee) throw new Error('The investigation price is unavailable');
      records.push({ permission: 'charge:create', type: 'charge', record: { ...newCharge({ ...fee, amountMinor: item.priceMinor!, currency: item.currency! }, { patientId: patient.id, encounterId: session.id, facts: patientBillingFacts(patient) }, context), id: 'charge:order:' + item.id, orderItemId: item.id, orderEntryId: entry.id } });
    }
    records.push({ permission: 'encounter:record', type: 'encounter_entry', record: { ...entry, id: newId('encounter_entry'), step: 'investigation_review', values: { decision: 'ordered', orderEntryId: entry.id }, labReport: undefined } });
  }
  if (session.purpose === 'nursing' && ['vitals','complaint'].includes(step)) records.push({ permission: 'encounter:record', type: 'ward_care_event', record: WardCareEvent.parse({ ...envelope(context, at), id: newId('ward_care_event'), type: 'ward_care_event', admissionId: session.admissionId, encounterId: session.id, patientId: session.patientId, occurredOn: at, values: { kind: 'complete' } }) });
  const current = wardAdmission(data, session.admissionId);
  if (current.length === 1 && !activeAdmission(current[0]) && !['lab_results','result_review','dispense','amendment'].includes(step) && options.lateReason?.trim() && options.performedOn) {
    return retainClinicalDraftForReview(records.filter((item) => item.type !== 'ward_care_event'), context);
  }
  await insertRecords(context, records, async (transaction) => {
    const locked = await readWardRecords(session.admissionId, transaction);
    const header = locked.encounters.find((e) => e.id === session.id) ?? headerFor(session, context, at);
    const allowPost = locked.encounters.some((e) => e.id === session.id) && ['lab_results','result_review','dispense','amendment'].includes(step);
    const issues = allowPost ? [] : wardSessionIssues(header, locked);
    issues.push(...wardEntryIssues(header, entry, { ...locked, encounters: [...locked.encounters, header] }, allowPost));
    const prior = effectiveEncounterEntries(locked.entries.filter((e) => e.encounterId === session.id));
    issues.push(...careEntryIssues(entry, prior, true));
    if (!['vitals','complaint','lab_results','result_review','amendment'].includes(step) && prior.some((e) => e.step === step)) issues.push('This section is signed; start a fresh review or correct the original');
    const candidateData = { ...locked, encounters: [...locked.encounters, header], entries: [...locked.entries, entry] };
    for (const record of records) if (record.type === 'ward_care_event') issues.push(...wardEventIssues(record.record as WardCareEvent, candidateData));
    if (issues.length) throw new Error(issues.join('. '));
  });
  return entry;
};

export const saveWardEvent = async (session: WardSession, values: WardCareValues, context: AuthorizationContext, options: { occurredOn?: string; lateReason?: string; requestId?: string; followUpAt?: string; finish?: boolean } = {}) => {
  assertSupport(context);
  if (options.requestId) {
    const prior = (await allOfType<WardCareEvent>('ward_care_event')).find((e) => e.id === options.requestId);
    if (prior) {
      if (prior.admissionId !== session.admissionId || prior.encounterId !== session.id || prior.createdBy !== context.userId || JSON.stringify(prior.values) !== JSON.stringify(WardCareEvent.parse({ ...prior, values }).values)
        || (options.occurredOn && Date.parse(prior.occurredOn) !== Date.parse(options.occurredOn))) throw new Error('This request identity already records different care');
      return prior;
    }
  }
  const at = new Date().toISOString();
  let followUp: NewRecord[] = [];
  if (values.kind === 'discharge' && options.followUpAt) {
    followUp = await bookingRecords({ patientId: session.patientId, scheduledFor: options.followUpAt, reason: 'Review after hospital discharge', visitType: 'follow_up' }, context, at);
    values = { ...values, appointmentId: (followUp[0].record as { id: string }).id };
  }
  const event = WardCareEvent.parse({ ...envelope(context, at), id: options.requestId ?? newId('ward_care_event'), type: 'ward_care_event', admissionId: session.admissionId, encounterId: session.id, patientId: session.patientId, occurredOn: options.occurredOn ?? at, lateReason: options.lateReason, values });
  for (const action of wardClinicalActions(event)) assertAllowed(context, CLINICAL_ACTION_PERMISSIONS[action]);
  const records: NewRecord[] = [...await ensureHeader(session, context, at), ...followUp, { permission: 'encounter:record', type: 'ward_care_event', record: event }];
  if (options.finish || values.kind === 'administration' || values.kind === 'discharge' || (values.kind === 'medication' && values.action !== 'start')) records.push({ permission: 'encounter:record', type: 'ward_care_event', record: WardCareEvent.parse({ ...event, id: newId('ward_care_event'), values: { kind: 'complete' } }) });
  await insertRecords(context, records, async (transaction) => {
    const locked = await readWardRecords(session.admissionId, transaction);
    const header = locked.encounters.find((e) => e.id === session.id) ?? headerFor(session, context, at);
    const issues = wardSessionIssues(header, locked);
    issues.push(...wardEventIssues(event, { ...locked, encounters: [...locked.encounters, header] }));
    if (issues.length) throw new Error(issues.join('. '));
  });
  return event;
};

export const activeWardOrders = (data: WardRecords) => medicationHeads(data.events).filter((e) => e.values.kind === 'medication' && e.values.action !== 'stop');
export const currentDischargeSummary = (data: WardRecords) => dischargeHeads(data.events);
