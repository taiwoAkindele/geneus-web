import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Encounter, EncounterEntry, Patient, Payment, StockItem, FeeItem, pharmacyChargeId, prescriptionLines, supplyState, type DispensingDetails, type Charge, type StockMovement } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests } from '@/lib/secureStorage';
import { recordServerContact } from './deviceCredential';
import { setDatabaseForTests } from './database';
import { sqliteTestDatabase } from './testing/sqliteDatabase';
import { rememberPharmacySupport } from './pharmacySupport';
import { readPharmacy, saveDispensing } from './repos/pharmacy';
import { allOfType } from './db';
import { chargesForPatient, chargeBalances } from './repos/billing';
import { listStockMovements } from './repos/stock';
import { requestQueues } from '@/modules/clinical/encounter/requestQueues';
import { WardCareEvent } from '@shared';
import { usablePharmacyEntries } from './repos/pharmacyAcceptance';

const context = (readOnly = false) => authorizationFor({ staff: { staffId: 'staff:pharmacist', role: 'pharmacy_staff', permission: readOnly ? 'read_only' : 'read_write' }, facilityId: 'TEST', deviceId: 'device:one' });
const base = { facilityId: 'TEST', schemaVersion: 5, createdBy: 'staff:doctor', deviceId: 'device:one', createdOn: new Date(Date.now() - 60_000).toISOString() };
const patientId = 'TEST-000001-K2', encounterId = 'visit:one';
const source = EncounterEntry.parse({ ...base, type: 'encounter_entry', id: 'rx:one', patientId, encounterId, actorRole: 'doctor', step: 'prescription', workflowVersion: 1, values: { decision: 'prescribed', prescription: [{ drug: 'Synthetic medicine', dose: 'Recorded instructions', quantity: 20, unitOfMeasure: 'tablets' }] } });
const lineId = prescriptionLines(source)[0].lineId;
const d = (changes: Partial<DispensingDetails> = {}): DispensingDetails => ({ prescriptionEntryId: source.id, lineId, action: 'supply', complete: false, quantity: 5, unit: 'tablets', source: 'stock', stockItemId: 'stock:one', billing: 'charge', feeItemId: 'fee:one', unitPriceMinor: 100, currency: 'NGN', chargedMinor: 500, ...changes });
describe('pharmacy supplies against real SQLite', () => {
  let storage: ReturnType<typeof sqliteTestDatabase>;
  beforeEach(async () => {
    vi.stubGlobal('localStorage', memoryStorage()); resetSecureStorageForTests(); recordServerContact(new Date().toISOString());
    storage = sqliteTestDatabase(); setDatabaseForTests(storage.db); rememberPharmacySupport(context(), 1);
    await storage.seed(Patient.parse({ ...base, type: 'patient', id: patientId, patientId, fullName: 'Synthetic pharmacy patient', address: 'Synthetic address', sex: 'female', ageYears: 30 }));
    await storage.seed(Encounter.parse({ ...base, type: 'encounter', id: encounterId, patientId, openedOn: base.createdOn }));
    await storage.seed(source);
    await storage.seed(StockItem.parse({ ...base, type: 'stock_item', id: 'stock:one', name: 'Synthetic medicine', category: 'drug', unitOfMeasure: 'tablets', quantityOnHand: 100 }));
    await storage.seed(FeeItem.parse({ ...base, type: 'fee_item', id: 'fee:one', name: 'Synthetic medicine', category: 'other', amountMinor: 100, currency: 'NGN', chargeWhen: 'when_ordered' }));
  });
  afterEach(async () => { setDatabaseForTests(undefined); await storage.db.close(); vi.unstubAllGlobals(); });
  const save = (id: string, details = d()) => saveDispensing(patientId, encounterId, details, context(), id);
  it('queues and supplies signed discharge medicines directly, keeping revised summaries out of new supply', async () => {
    const summary = WardCareEvent.parse({ ...base, id: 'summary:one', type: 'ward_care_event', admissionId: 'stay:one', patientId, encounterId, occurredOn: base.createdOn, values: { kind: 'discharge', admissionReason: 'Recorded reason', diagnoses: 'Recorded diagnosis', course: 'Recorded care', instructions: 'Reviewed instructions', takeHome: source.values.prescription, sourceEntryIds: [], patientName: 'Synthetic patient', patientIdentifier: patientId, admittedOn: base.createdOn } });
    await storage.seed(summary);
    const details = d({ prescriptionEntryId: summary.id, lineId: prescriptionLines(summary)[0].lineId });
    expect(requestQueues([], [summary]).pharmacy.open[0].id).toBe(summary.id);
    const first = await save('take-home:first', details);
    const records = await readPharmacy(patientId, encounterId);
    expect(supplyState(summary, details.lineId, records.entries).supplied).toBe(5);
    expect(records.movements).toHaveLength(1); expect(records.charges).toHaveLength(1);
    const revised = WardCareEvent.parse({ ...summary, id: 'summary:two', values: { ...summary.values, previousId: summary.id } });
    await storage.seed(revised);
    const queues = requestQueues(records.entries.filter((e) => e.step !== 'prescription'), [summary, revised]);
    expect(queues.pharmacy.open.map((r) => r.id)).toEqual([revised.id]);
    expect(queues.pharmacy.completed[0]).toMatchObject({ id: summary.id, superseded: true });
    await expect(save('take-home:stale', { ...details, previousEntryId: first.id })).rejects.toThrow(/revised/);
  });
  it('saves the actual quantity, stock deduction and bill atomically and deduplicates a retry', async () => {
    const entry = await save('supply:first'); await save('supply:first');
    expect(await allOfType<StockMovement>('stock_movement')).toHaveLength(1); expect(await chargesForPatient(patientId)).toHaveLength(1);
    expect((await chargesForPatient(patientId))[0]).toMatchObject({ id: pharmacyChargeId(entry.id), amountMinor: 500 });
    const data = await readPharmacy(patientId, encounterId); expect(supplyState(source, lineId, data.entries).supplied).toBe(5);
    expect(requestQueues([...data.entries]).pharmacy.open).toHaveLength(1);
  });
  it('keeps partial requests open, completes a top-up, and refuses stale or excessive supplies', async () => {
    const first = await save('supply:first');
    await expect(save('stale', d())).rejects.toThrow(/another update/);
    await expect(save('too-many', d({ previousEntryId: first.id, quantity: 16, chargedMinor: 1600, complete: true }))).rejects.toThrow(/exceeds/);
    await save('supply:rest', d({ previousEntryId: first.id, quantity: 15, chargedMinor: 1500, complete: true }));
    const data = await readPharmacy(patientId, encounterId); expect(requestQueues([...data.entries]).pharmacy.completed).toHaveLength(1);
    expect(data.charges.reduce((n, c) => n + c.amountMinor, 0)).toBe(2000);
  });
  it('rolls back a physical count failure without retaining a bill or clinical entry', async () => {
    await storage.db.execute('UPDATE stock_items SET quantityOnHand=2 WHERE id=?', ['stock:one']);
    await expect(save('too-much-stock')).rejects.toThrow(/exceeds recorded stock/);
    expect(await allOfType<Charge>('charge')).toHaveLength(0); expect(await allOfType<StockMovement>('stock_movement')).toHaveLength(0);
  });
  it('records outside supplies without hospital stock or billing', async () => {
    await save('outside', d({ source: 'outside', stockItemId: undefined, billing: 'outside', feeItemId: undefined, unitPriceMinor: undefined, currency: undefined, chargedMinor: undefined }));
    expect(await allOfType<StockMovement>('stock_movement')).toHaveLength(0); expect(await allOfType<Charge>('charge')).toHaveLength(0);
  });
  it('adds a price to a saved unpriced supply without deducting stock twice', async () => {
    const first = await save('unpriced', d({ billing: 'unpriced', feeItemId: undefined, unitPriceMinor: undefined, currency: undefined, chargedMinor: undefined, reason: 'Price needs checking' }));
    expect(requestQueues([...(await readPharmacy(patientId, encounterId)).entries]).pharmacy.open[0].billingPending).toBe(1);
    await save('priced', { prescriptionEntryId: source.id, lineId, previousEntryId: first.id, action: 'price', priceFor: first.id, complete: false, quantity: 5, unit: 'tablets', billing: 'charge', feeItemId: 'fee:one', unitPriceMinor: 100, currency: 'NGN', chargedMinor: 500 });
    expect(await listStockMovements()).toHaveLength(1); expect(await chargesForPatient(patientId)).toHaveLength(1);
    expect(requestQueues([...(await readPharmacy(patientId, encounterId)).entries]).pharmacy.open[0].billingPending).toBe(0);
  });
  it('retains returns and records credit without inventing a money refund', async () => {
    const first = await save('supply:first');
    await save('returned', { prescriptionEntryId: source.id, lineId, previousEntryId: first.id, action: 'return', returnOf: first.id, complete: false, quantity: 2, unit: 'tablets', restock: true, creditMinor: 200, reason: 'Recorded return to pharmacy' });
    const data = await readPharmacy(patientId, encounterId);
    expect(data.movements.map((m) => m.change)).toEqual([-5, 2]); expect(chargeBalances([...data.charges], [], [...data.adjustments])[0].balanceMinor).toBe(300);
    expect(await allOfType('payment')).toHaveLength(0);
  });
  it('blocks read-only writers and requires an accepted server capability', async () => {
    await expect(saveDispensing(patientId, encounterId, d(), context(true), 'forbidden')).rejects.toThrow();
    rememberPharmacySupport(context()); await expect(save('unsupported')).rejects.toThrow(/Connect once/);
  });
  it('shows a credit on an already paid medicine bill without recording a cash refund', async () => {
    const first = await save('supply:paid');
    await storage.seed(Payment.parse({ ...base, type: 'payment', id: 'payment:medicine', patientId, receiptNumber: 'TEST-R-000001-K2', method: 'cash', currency: 'NGN', amountMinor: 500, allocations: [{ chargeId: pharmacyChargeId(first.id), amountMinor: 500 }] }));
    await save('return:paid', { prescriptionEntryId: source.id, lineId, previousEntryId: first.id, action: 'return', returnOf: first.id, complete: false, quantity: 2, unit: 'tablets', restock: false, creditMinor: 200, reason: 'Medicine returned after payment' });
    const data = await readPharmacy(patientId, encounterId), payments = await allOfType<Payment>('payment');
    expect(chargeBalances([...data.charges], payments, [...data.adjustments])[0].balanceMinor).toBe(-200);
    expect(payments).toHaveLength(1); expect(data.movements).toHaveLength(1);
  });
  it('does not project refused supplies into stock balances or patient bills while waiting for a checkpoint', async () => {
    const first = await save('supply:refused', d({ quantity: 20, chargedMinor: 2000, complete: true }));
    expect(requestQueues(await allOfType<EncounterEntry>('encounter_entry')).pharmacy.completed).toHaveLength(1);
    await storage.db.execute('INSERT INTO workforce_upload_receipts(id,clientId,outcome) VALUES (?,?,?)', [first.id, 1, 'rejected']);
    expect(await listStockMovements()).toHaveLength(0); expect(await chargesForPatient(patientId)).toHaveLength(0);
    expect((await readPharmacy(patientId, encounterId)).entries.some((e) => e.id === first.id)).toBe(false);
    const queue = requestQueues(await usablePharmacyEntries(await allOfType<EncounterEntry>('encounter_entry'))).pharmacy;
    expect(queue.open.map((r) => r.id)).toEqual([source.id]); expect(queue.completed).toHaveLength(0);
    await expect(save('supply:repeat-after-refusal')).rejects.toThrow(/Sync & review/);
    expect(await allOfType<Charge>('charge')).toHaveLength(1);
  });
});
