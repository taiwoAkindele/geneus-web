import { describe, expect, it } from 'vitest';
import { FeeItem } from '@shared';
import { buildTariffRows, checkTariffRows, importLines, parsePrice } from './tariffRows';

const fee = (id: string, name: string, currency = 'NGN', active = true) => FeeItem.parse({
  id, name, facilityId: 'facility:one', schemaVersion: 5, createdBy: 'staff:one', createdOn: '2026-11-01T00:00:00.000Z', deviceId: 'device:one',
  type: 'fee_item', category: 'consultation', amountMinor: 1_000, currency, chargeWhen: 'when_ordered', active,
});
const fees = [fee('fee:consult', 'General consultation'), fee('fee:rdt', 'Malaria RDT'), fee('fee:fbc', 'Full blood count'), fee('fee:usd', 'Dollar test', 'USD')];
const row = (sourceRow: number, values: Record<string, string>) => ({ sourceRow, values });

describe('tariff rows from a sheet', () => {
  it('reads prices the way HMO sheets write them, and refuses anything else', () => {
    expect(parsePrice('₦1,500.00', 'NGN')).toBe(150_000);
    expect(parsePrice('N 2,000', 'NGN')).toBe(200_000);
    expect(parsePrice('NGN1500.5', 'NGN')).toBe(150_050);
    expect(parsePrice('0', 'NGN')).toBe(0);
    for (const bad of ['', '-100', '(100)', '1.234', 'call us', '=1+1']) expect(() => parsePrice(bad, 'NGN')).toThrow();
  });
  it('applies exact matches, waits for a person on suggestions, and flags every other problem by row', () => {
    const rows = buildTariffRows([
      row(2, { name: 'General Consultation', price: '1,500', payerCode: 'C-01' }),
      row(3, { name: 'Full blood count (FBC)', price: '2000' }),
      row(4, { name: 'Malaria RDT', price: 'free' }),
      row(5, { name: 'Appendicectomy', price: '90000' }),
      row(6, { name: 'general consultation', price: '1600' }),
      row(7, { feeItemId: 'fee:usd', name: 'x', price: '10' }),
      row(8, { feeItemId: 'fee:fbc', name: 'x', price: '700', payerCode: '=cmd' }),
    ], fees.filter((f) => f.id !== 'fee:usd').concat(fees[3]), { 'fee:consult': { unitMinor: 120_000 } });
    expect(rows.find((r) => r.sourceRow === 5)?.include).toBe(false);
    const checked = checkTariffRows(rows, fees, 'NGN', { 'fee:consult': { unitMinor: 120_000 } });
    const at = (n: number) => checked.find((r) => r.sourceRow === n)!;
    expect([at(2).status, at(2).change, at(2).unitMinor]).toEqual(['ready', 'changed', 150_000]);
    expect([at(3).status, at(3).problem]).toEqual(['needs_match', 'Confirm the matching service']);
    expect(at(4).status).toBe('error');
    expect(at(5).status).toBe('skipped');
    expect([at(6).status, at(6).problem]).toEqual(['error', 'Row 2 already prices this service']);
    expect(at(7).problem).toMatch(/USD/);
    expect(at(8).problem).toMatch(/starts with =/);
    // The person confirms the suggestion; only ready rows are ever sent.
    const confirmed = checkTariffRows(rows.map((r) => r.sourceRow === 3 ? { ...r, feeItemId: 'fee:fbc' } : r), fees, 'NGN');
    expect(importLines(confirmed)).toEqual([
      { feeItemId: 'fee:consult', unitMinor: 150_000, payerCode: 'C-01', sourceRow: 2 },
      { feeItemId: 'fee:fbc', unitMinor: 200_000, sourceRow: 3 },
    ]);
  });
  it('matches a recorded payer code exactly on the next import', () => {
    const [r] = buildTariffRows([row(2, { name: 'Consult (GP)', payerCode: 'c-01', price: '1500' })], fees, { 'fee:consult': { unitMinor: 1, payerCode: 'C-01' } });
    expect(r.match).toEqual({ kind: 'exact', id: 'fee:consult', by: 'code' });
  });
});
