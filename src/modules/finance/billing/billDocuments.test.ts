import { describe, it, expect } from 'vitest';
import { Charge, Payment, IncomingTransfer, Refund } from '@shared';
import {
  billDocuments,
  paymentDocuments,
  billKey,
  historyDocuments,
  unlinkedTransfers,
} from './billDocuments';
import { placeQuestions } from './billingQuestions';
import { displayMoney, whenText } from './billingUi';
import type { BillingData } from './useBilling';
const env = {
  facilityId: 'TEST',
  createdBy: 'staff:1',
  createdOn: '2026-11-19T10:00:00Z',
  deviceId: 'device:1',
};
const charge = (id: string) =>
  Charge.parse({
    ...env,
    id,
    type: 'charge',
    patientId: 'TEST-000001-K2',
    feeItemId: 'fee:1',
    category: 'consultation',
    description: 'Visit',
    amountMinor: 10000,
    listPriceMinor: 10000,
    currency: 'NGN',
  });
const data = (charges: ReturnType<typeof charge>[], payments: Payment[] = []) =>
  ({
    charges,
    payments,
    adjustments: [],
    transfers: [],
    fees: [],
    patients: [],
    staff: [],
    departments: [],
    coverage: { estimates: new Map(), refunds: [] },
  }) as unknown as BillingData;
const payment = (id: string) =>
  Payment.parse({
    ...env,
    id,
    type: 'payment',
    patientId: 'TEST-000001-K2',
    method: 'cash',
    currency: 'NGN',
    receiptNumber: 'TEST-R-000001-K2',
    amountMinor: 5000,
    allocations: [{ chargeId: 'a', amountMinor: 5000 }],
  });
describe('Bills and Payments presentation', () => {
  it('never merges unrelated charges simply because a patient and date match', () => {
    expect(billDocuments(data([charge('a'), charge('b')]))).toHaveLength(2);
  });
  it('groups an explicit manual bill and keeps a second bill separate', () => {
    const a = { ...charge('a'), billId: '51534e18-926f-4260-bbf5-9fa9e738c736' };
    const b = { ...charge('b'), billId: a.billId };
    const bills = billDocuments(data([a, b, charge('c')], [payment('cash')]));
    expect(bills).toHaveLength(2);
    const bill = bills.find((g) => g.id === billKey(a))!;
    expect(bill.original).toBe(20000);
    expect(bill.due).toBe(15000);
  });
  it('uses explicit visit links but isolates currencies and patients', () => {
    const a = { ...charge('a'), encounterId: 'visit:1' };
    const b = { ...charge('b'), encounterId: 'visit:1' };
    const c = { ...charge('c'), encounterId: 'visit:1', patientId: 'TEST-000002-K2' };
    const d = { ...charge('d'), encounterId: 'visit:1', currency: 'USD' };
    expect(billDocuments(data([a, b, c, d]))).toHaveLength(3);
  });
  it('keeps settled and credited charges visible rather than deleting them', () => {
    const p = payment('overpaid');
    p.amountMinor = 15000;
    p.allocations[0].amountMinor = 15000;
    const bill = billDocuments(data([charge('a')], [p]))[0];
    expect(bill.due).toBe(0);
    expect(bill.credit).toBe(5000);
    expect(bill.status).toBe('Credit');
  });
  it('shows a verified incoming source once, with its allocation receipts nested', () => {
    const source = IncomingTransfer.parse({
      ...env,
      id: 'source',
      type: 'incoming_transfer',
      provider: 'paystack',
      providerReference: 'verified',
      amountMinor: 15000,
      currency: 'NGN',
      receivedOn: env.createdOn,
      mode: 'live',
    });
    const bank = { ...payment('bank'), method: 'transfer' as const, incomingTransferId: source.id };
    const rows = paymentDocuments([payment('cash'), bank], [source]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === 'source')?.receipts).toEqual([bank]);
    expect(rows.reduce((n, r) => n + r.amount, 0)).toBe(20000);
  });
  it('retains legacy bank receipts without a replicated source and shows reversals signed', () => {
    const original = payment('cash');
    const reversal = { ...payment('reverse'), reverses: original.id };
    expect(paymentDocuments([original, reversal], []).reduce((n, r) => n + r.amount, 0)).toBe(0);
    expect(
      paymentDocuments([{ ...original, incomingTransferId: 'not-on-device' }], []),
    ).toHaveLength(1);
  });
  it('shows actual refunds as money returned without creating incoming receipt capacity', () => {
    const refund = Refund.parse({
      ...env,
      id: 'refund',
      type: 'refund',
      patientId: 'TEST-000001-K2',
      refundNumber: 'TEST-F-000001',
      method: 'cash',
      currency: 'NGN',
      amountMinor: 5000,
      allocations: [{ chargeId: 'a', amountMinor: 5000 }],
      reason: 'Approved credit',
    });
    const rows = paymentDocuments([payment('cash')], [], [refund]);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.refund)?.amount).toBe(-5000);
    expect(rows.find((r) => r.refund)?.transfer).toBeUndefined();
  });
  it('labels a fully paid bill Paid', () => {
    const p = payment('full');
    p.amountMinor = 10000;
    p.allocations[0].amountMinor = 10000;
    expect(billDocuments(data([charge('a')], [p]))[0].status).toBe('Paid');
  });
});

const transfer = (id: string, amountMinor: number, mode: 'live' | 'test' = 'live') =>
  IncomingTransfer.parse({
    ...env,
    id,
    type: 'incoming_transfer',
    provider: 'paystack',
    providerReference: id,
    amountMinor,
    currency: 'NGN',
    receivedOn: env.createdOn,
    mode,
  });
describe('Payment history', () => {
  it('lists completed payments only: cash, applied bank transfers, reversals and refunds, never the incoming transfer itself', () => {
    const bank = { ...payment('bank'), method: 'transfer' as const, incomingTransferId: 't1' };
    const reversal = { ...payment('rev'), reverses: 'cash' };
    const refund = Refund.parse({
      ...env,
      id: 'refund',
      type: 'refund',
      patientId: 'TEST-000001-K2',
      refundNumber: 'TEST-F-000001',
      method: 'cash',
      currency: 'NGN',
      amountMinor: 2000,
      allocations: [{ chargeId: 'a', amountMinor: 2000 }],
      reason: 'Credit',
    });
    const rows = historyDocuments([payment('cash'), bank, reversal], [refund]);
    expect(rows.map((r) => r.kind).sort()).toEqual(['bank', 'cash', 'refund', 'reversal']);
    expect(rows.reduce((n, r) => n + r.amount, 0)).toBe(5000 + 5000 - 5000 - 2000);
    expect(rows.find((r) => r.kind === 'bank')?.chargeIds).toEqual(['a']);
  });
  it('keeps a live transfer waiting until all of it is applied, and never offers test transfers', () => {
    const applied = { ...payment('bank'), method: 'transfer' as const, incomingTransferId: 'part' };
    const waiting = unlinkedTransfers(
      [transfer('part', 15000), transfer('done', 5000), transfer('test', 9000, 'test')],
      [applied, { ...payment('b2'), method: 'transfer' as const, incomingTransferId: 'done' }],
    );
    expect(waiting.map((w) => [w.transfer.id, w.applied])).toEqual([['part', 5000]]);
  });
});

describe('Billing questions on bills', () => {
  const bill = (id: string, extra: Partial<ReturnType<typeof charge>>) => ({
    ...charge(id),
    ...extra,
  });
  it('places a question on the patient bill with a hand-raised charge in the same visit', () => {
    const manual = bill('m', { billId: '51534e18-926f-4260-bbf5-9fa9e738c736' });
    const ordered = bill('o', { encounterId: 'visit:1', orderItemId: 'item:1' });
    const bills = billDocuments(data([manual, ordered]));
    const { byBill, unplaced } = placeQuestions(bills, [
      { key: 'q', patientId: 'TEST-000001-K2', encounterId: 'visit:1', name: 'Visit' },
    ]);
    expect([...byBill.keys()]).toEqual([billKey(manual)]);
    expect(unplaced).toEqual([]);
  });
  it('keeps a question reachable when no bill fits it', () => {
    const { byBill, unplaced } = placeQuestions(
      billDocuments(data([bill('o', { encounterId: 'visit:2', orderItemId: 'item:2' })])),
      [{ key: 'q', patientId: 'TEST-000001-K2', encounterId: 'visit:9', name: 'Visit' }],
    );
    expect(byBill.size).toBe(0);
    expect(unplaced).toHaveLength(1);
  });
});

describe('Billing display', () => {
  const now = new Date(2026, 10, 21, 15, 0);
  it('shows a time today, Yesterday, then a date', () => {
    expect(whenText(new Date(2026, 10, 21, 9, 41).toISOString(), now)).toBe('09:41');
    expect(whenText(new Date(2026, 10, 20, 9, 41).toISOString(), now)).toBe('Yesterday');
    expect(whenText(new Date(2026, 10, 2, 9, 41).toISOString(), now)).toBe('2 Nov 2026');
  });
  it('shows money with its currency symbol', () => {
    expect(displayMoney(2050000, 'NGN')).toBe('₦20,500.00');
  });
});
