import { EncounterEntry, DispensingDetails, dispensingDetails, dispensingSummary, pharmacyIssues, pharmacyEffects, type Encounter, type Appointment, type AnyDocument, type AuthorizationContext, type DocType, type PharmacyRecords, type Patient, type StockItem, type StockMovement, type FeeItem, type Charge, type BillingAdjustment, type WardCareEvent, type SyncRejection } from '@shared';
import { assertAllowed } from '@/auth/authorization';
import { allOfType, allWhere, findRecord, envelope, insertRecords, type NewRecord } from '../db';
import { fieldKindsFor } from '../contractShape';
import { fromRow, type Row } from '../rows';
import { TABLE_FOR } from '../tables';
import type { LocalDatabase } from '../database';
import { pharmacySupported } from '../pharmacySupport';
import { activeWorkspace } from '../facilityWorkspaces';
import { listWorkforceReceipts } from './workforceReceipts';

type Reader = Pick<LocalDatabase, 'getOptional'>;
type LocalPharmacyRecords = PharmacyRecords & { refusedSupplies: EncounterEntry[] };
const refusedSupply = (data: LocalPharmacyRecords, details: DispensingDetails) => data.refusedSupplies.some((entry) => { const d = dispensingDetails(entry); return d?.prescriptionEntryId === details.prescriptionEntryId && d.lineId === details.lineId; });
export const readPharmacy = async (patientId: string, encounterId: string, reader?: Reader): Promise<LocalPharmacyRecords> => {
  const read = async <T extends AnyDocument>(type: DocType, field?: string, value?: string): Promise<T[]> => {
    if (!reader) return field ? allWhere<T>(type, field, value!) : allOfType<T>(type);
    const fields = Object.keys(fieldKindsFor(type));
    const row = await reader.getOptional<{ records: string }>(`SELECT json_group_array(json_object(${fields.map((field) => `'${field}', "${field}"`).join(',')})) AS records FROM ${TABLE_FOR[type]}${field ? ` WHERE "${field}"=?` : ''}`, field ? [value] : []);
    return (JSON.parse(row?.records ?? '[]') as Row[]).map((r) => fromRow<T>(type, r));
  };
  const [entries, items, movements, fees, charges, adjustments, patients, wardEvents, refused, receipts] = await Promise.all([
    read<EncounterEntry>('encounter_entry', 'encounterId', encounterId), read<StockItem>('stock_item'), read<StockMovement>('stock_movement'), read<FeeItem>('fee_item'), read<Charge>('charge', 'patientId', patientId), read<BillingAdjustment>('billing_adjustment', 'patientId', patientId), read<Patient>('patient', 'patientId', patientId), read<WardCareEvent>('ward_care_event', 'patientId', patientId), read<SyncRejection>('sync_rejection'),
    reader ? reader.getOptional<{ records: string }>(`SELECT json_group_array(json_object('id',id,'outcome',outcome)) AS records FROM workforce_upload_receipts`).then((r) => JSON.parse(r?.records ?? '[]') as { id: string; outcome: string }[]) : listWorkforceReceipts(),
  ]);
  const headerRow = reader ? await reader.getOptional<Row>('SELECT * FROM encounters WHERE id=?', [encounterId]) : undefined;
  const header = reader ? headerRow && fromRow<Encounter>('encounter', headerRow) : await findRecord<Encounter>('encounter', encounterId);
  const bookingRow = reader && header?.appointmentId ? await reader.getOptional<Row>('SELECT * FROM appointments WHERE id=?', [header.appointmentId]) : undefined;
  const booking = reader ? bookingRow && fromRow<Appointment>('appointment', bookingRow) : header?.appointmentId ? await findRecord<Appointment>('appointment', header.appointmentId) : undefined;
  const accepted = new Set(receipts.filter((r) => r.outcome === 'applied').map((r) => r.id));
  const blocked = new Set([...refused.filter((r) => !accepted.has(r.entityId)).map((r) => r.entityId), ...receipts.filter((r) => r.outcome === 'rejected' && !accepted.has(r.id)).map((r) => r.id)]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const e of wardEvents) if (!blocked.has(e.id) && (blocked.has(e.encounterId) || blocked.has(e.admissionId) || ('previousId' in e.values && e.values.previousId && blocked.has(e.values.previousId)))) { blocked.add(e.id); changed = true; }
    for (const e of entries) {
      const d = dispensingDetails(e);
      if (!blocked.has(e.id) && (blocked.has(e.encounterId) || (d && (blocked.has(d.prescriptionEntryId) || Boolean(d.previousEntryId && blocked.has(d.previousEntryId)))))) { blocked.add(e.id); changed = true; }
    }
  }
  const effects = <T extends { dispenseEntryId?: string }>(records: T[]) => records.filter((r) => !r.dispenseEntryId || !blocked.has(r.dispenseEntryId));
  return { refusedSupplies: entries.filter((e) => e.pharmacyVersion === 1 && blocked.has(e.id)), visitType: header?.visitType ?? booking?.visitType, entries: entries.filter((e) => e.patientId === patientId && e.encounterId === encounterId && !blocked.has(e.id)), items, movements: effects(movements), fees, charges: effects(charges).filter((c) => c.patientId === patientId), adjustments: effects(adjustments).filter((a) => a.patientId === patientId), patient: patients.find((p) => p.patientId === patientId), wardEvents: wardEvents.filter((e) => e.patientId === patientId && !blocked.has(e.id)) };
};
export const loadPharmacy = async (patientId: string, encounterId: string, context: AuthorizationContext) => {
  assertAllowed(context, 'patient_chart:read');
  const workspace = activeWorkspace();
  if (workspace && (workspace.facilityId !== context.facilityId || workspace.deviceId !== context.deviceId)) throw new Error('Open Pharmacy in the current hospital workspace');
  const data = await readPharmacy(patientId, encounterId);
  if (data.patient?.facilityId !== context.facilityId) throw new Error('This patient is unavailable in the current hospital');
  return data;
};
export const saveDispensing = async (patientId: string, encounterId: string, details: DispensingDetails, context: AuthorizationContext, requestId: string) => {
  assertAllowed(context, 'encounter:record'); assertAllowed(context, 'clinical:dispense');
  details = DispensingDetails.parse(details);
  if (!pharmacySupported(context)) throw new Error('Connect once to confirm this server supports quantity-based dispensing');
  const data = await loadPharmacy(patientId, encounterId, context);
  if (refusedSupply(data, details)) throw new Error('Review this medicine’s refused supply in Sync & review before recording another update');
  const existing = data.entries.find((e) => e.id === requestId);
  if (existing) {
    if (JSON.stringify(dispensingDetails(existing)) !== JSON.stringify(details) || existing.createdBy !== context.userId) throw new Error('This save identity already records different dispensing');
    return existing;
  }
  const source = data.entries.find((e) => e.id === details.prescriptionEntryId) ?? data.wardEvents?.find((e) => e.id === details.prescriptionEntryId && e.values.kind === 'discharge');
  if (!source) throw new Error('This signed prescription is unavailable');
  const at = new Date().toISOString();
  const candidate = EncounterEntry.parse({ ...envelope(context, at), id: requestId, type: 'encounter_entry', workflowVersion: 1, pharmacyVersion: 1, patientId, encounterId, admissionId: source.admissionId, performedOn: at, actorRole: context.role,
    values: { supply: details, lines: dispensingSummary(source, data.entries) }, step: 'dispense' });
  candidate.values.lines = dispensingSummary(source, data.entries, candidate);
  const issues = pharmacyIssues(candidate, data);
  if (issues.length) throw new Error(issues.join('. '));
  const effects = pharmacyEffects(candidate, data);
  const records: NewRecord[] = [{ permission: 'encounter:record', type: 'encounter_entry', record: candidate }, ...effects.map((record): NewRecord => ({ permission: 'clinical:dispense', type: record.type, record }))];
  await insertRecords(context, records, async (transaction) => {
    const locked = await readPharmacy(patientId, encounterId, transaction);
    if (refusedSupply(locked, details)) throw new Error('Review this medicine’s refused supply in Sync & review before recording another update');
    const issues = pharmacyIssues(candidate, locked);
    if (details.action === 'supply' && details.stockItemId) {
      const item = locked.items.find((i) => i.id === details.stockItemId)!;
      const balance = item.quantityOnHand + locked.movements.filter((m) => m.itemId === item.id).reduce((n, m) => n + m.change, 0);
      if (balance + 1e-6 < details.quantity!) issues.push('Giving this quantity exceeds recorded stock. Check the stock item and physical count');
    }
    if (issues.length) throw new Error(issues.join('. '));
  });
  return candidate;
};
