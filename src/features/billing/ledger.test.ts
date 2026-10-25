import { describe, expect, it } from 'vitest';
import { BillingAdjustment, Charge, IncomingTransfer, Payment } from '@shared';
import { billingRows, totalsFor, transferAllocated } from './ledger';

const env = { facilityId: 'TEST', createdBy: 'staff:1', createdOn: '2026-10-25T10:00:00Z', deviceId: 'device:1' };
const patientId = 'TEST-000001-K2';
const charge = (id: string, amountMinor = 50000) => Charge.parse({ ...env, id, type: 'charge', patientId, feeItemId: 'fee:1', departmentId: 'pharmacy', category: 'registration', description: 'Registration', amountMinor, listPriceMinor: amountMinor, currency: 'NGN' });
describe('department and category ledger projections', () => {
  it('allocates one receipt across categories without counting its full amount twice', () => {
    const registration = charge('charge:reg'); const lab = { ...charge('charge:lab', 100000), category: 'laboratory' as const };
    const payment = Payment.parse({ ...env, id: 'payment:1', type: 'payment', patientId, method: 'cash', currency: 'NGN', receiptNumber: 'TEST-R-000001-K2', amountMinor: 150000, allocations: [{ chargeId: registration.id, amountMinor: 50000 }, { chargeId: lab.id, amountMinor: 100000 }] });
    const rows = billingRows([registration, lab], [payment], []);
    expect(totalsFor(rows.filter((r) => r.charge.category === 'registration')).collected).toBe(50000);
    expect(totalsFor(rows).collected).toBe(150000);
  });
  it('retains unpaid, exempt, discounted and waived entries in the category ledger', () => {
    const original = charge('charge:reg');
    const discount = BillingAdjustment.parse({ ...env, id: 'adj:1', type: 'billing_adjustment', chargeId: original.id, patientId, kind: 'discount', amountMinor: 10000, reason: 'Concession' });
    const waiver = { ...discount, id: 'adj:2', kind: 'waiver' as const, amountMinor: 40000, reason: 'Approved waiver' };
    const exempt = { ...charge('charge:exempt'), amountMinor: 0, exemptionReason: 'Under-5' };
    const rows = billingRows([original, exempt, charge('charge:unpaid')], [], [discount, waiver]);
    expect(rows).toHaveLength(3); expect(rows[0].status).toBe('Settled');
    expect(totalsFor(rows)).toMatchObject({ original: 150000, discounted: 10000, waived: 40000, exempt: 50000, collected: 0, outstanding: 50000 });
  });
  it('shows verified department funds even before patient allocation and tracks the unallocated remainder', () => {
    const incoming = IncomingTransfer.parse({ ...env, id: 'incoming_transfer:1', type: 'incoming_transfer', provider: 'paystack', mode: 'live', providerReference: 'ref', amountMinor: 100000, currency: 'NGN', receivedOn: env.createdOn, departmentId: 'pharmacy' });
    const payment = Payment.parse({ ...env, id: 'payment:1', type: 'payment', patientId, method: 'transfer', incomingTransferId: incoming.id, receiptNumber: 'TEST-R-000001-K2', amountMinor: 50000, currency: 'NGN', allocations: [{ chargeId: 'charge:reg', amountMinor: 50000 }] });
    expect(incoming.amountMinor - transferAllocated(incoming.id, [])).toBe(100000);
    expect(incoming.amountMinor - transferAllocated(incoming.id, [payment])).toBe(50000);
  });
  it('shows older waiver payments as waived fees rather than money received', () => {
    const bill = charge('charge:reg');
    const waiver = Payment.parse({ ...env, id: 'payment:waiver', type: 'payment', patientId, method: 'waiver', reason: 'Indigent patient', currency: 'NGN', receiptNumber: 'TEST-R-000001-K2', amountMinor: 50000, allocations: [{ chargeId: bill.id, amountMinor: 50000 }] });
    const rows = billingRows([bill], [waiver], []);
    expect(rows[0]).toMatchObject({ waivedMinor: 50000, dueMinor: 0, settledMinor: 0, balanceMinor: 0 });
    expect(totalsFor(rows)).toMatchObject({ waived: 50000, collected: 0 });
  });
});
