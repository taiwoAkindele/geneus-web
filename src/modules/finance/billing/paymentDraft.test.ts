import { describe, expect, it } from 'vitest';
import { Charge } from '@shared';
import { billingRows } from './ledger';
import { PaymentInputError, preparePayment } from './paymentDraft';

const base = { facilityId: 'TEST', createdBy: 'staff:one', createdOn: '2026-10-26T10:00:00Z', deviceId: 'device:one' };
const charge = (id: string, currency = 'NGN') => Charge.parse({ ...base, id, type: 'charge', patientId: 'TEST-000001-K2', feeItemId: 'fee:one', description: 'Consultation', category: 'consultation', amountMinor: 100000, listPriceMinor: 100000, currency });
describe('payment review validation', () => {
  it('requires a positive allocation within the unpaid balance and identifies the field', () => {
    const rows = billingRows([charge('charge:one')], [], []);
    expect(() => preparePayment(rows, {})).toThrow('Enter an amount');
    for (const amount of ['0', '1000.01', 'not money']) {
      try { preparePayment(rows, { 'charge:one': amount }); throw new Error('Accepted invalid allocation'); }
      catch (cause) { expect(cause).toBeInstanceOf(PaymentInputError); expect((cause as PaymentInputError).chargeId).toBe('charge:one'); }
    }
    expect(preparePayment(rows, { 'charge:one': '1000' })).toMatchObject({ amountMinor: 100000, currency: 'NGN' });
  });
  it('rejects mixed currencies and recomputes against a changed balance', () => {
    const rows = billingRows([charge('charge:one'), charge('charge:usd', 'USD')], [], []);
    expect(() => preparePayment(rows, { 'charge:one': '10', 'charge:usd': '10' })).toThrow('one currency');
    expect(() => preparePayment([{ ...rows[0], balanceMinor: 500 }], { 'charge:one': '10' })).toThrow('unpaid balance');
  });
});
