import { describe, expect, it } from 'vitest';
import type { FeeItem, StockItem } from '@shared';
import { readMedicineRows, reviewMedicines } from './stockImport';
import { MEDICINE_HEADERS } from './stockImportTemplate';

const envelope = {
  facilityId: 'TEST',
  deviceId: 'device:one',
  schemaVersion: 5,
  createdBy: 'staff:one',
  createdOn: '2026-11-25T10:00:00.000Z',
};

const fee: FeeItem = {
  ...envelope,
  id: 'fee:oral-rehydration',
  type: 'fee_item',
  name: 'Oral rehydration salts',
  category: 'pharmacy',
  currency: 'NGN',
  amountMinor: 12000,
  chargeWhen: 'when_ordered',
  exemptions: [],
  active: true,
};

const stock: StockItem = {
  ...envelope,
  id: 'stock:oral-rehydration',
  type: 'stock_item',
  name: fee.name,
  category: 'drug',
  unitOfMeasure: 'sachet',
  quantityOnHand: 40,
  feeItemId: fee.id,
};

const parsed = (rows: string[][], headers: string[] = MEDICINE_HEADERS) =>
  readMedicineRows({
    format: 'xlsx',
    sheets: [
      {
        name: 'Stock',
        rows: [headers, ...rows],
        truncatedRows: false,
        truncatedColumns: false,
        longCells: 0,
      },
    ],
  });

const reviewContext = { items: [], fees: [fee], currency: 'NGN', canCreatePrice: true };

describe('medicine import review', () => {
  it('reads alternate headings and rejects two headings for the same column', () => {
    const alternateHeaders = [
      'Medicine name',
      'Stock unit',
      'Stock on hand',
      'Low stock alert at',
      'Selling price per unit',
    ];
    const rows = [['Zinc 20 mg', 'tablet', '200', '20', '50']];

    expect(parsed(rows, alternateHeaders)).toEqual(parsed(rows));
    expect(() => parsed(rows, [...alternateHeaders, 'Opening quantity'])).toThrow(/headings/);
  });

  it('skips an exact item and unit even when its price is different', () => {
    const rows = parsed([[' oral rehydration salts ', 'SACHET', '200', '10', '999']]);

    expect(reviewMedicines(rows, {}, { ...reviewContext, items: [stock] })[0]).toMatchObject({
      status: 'existing',
    });
  });

  it('requires a decision when the name matches but the stock unit differs', () => {
    const rows = parsed([[fee.name, 'carton', '2', '', '1000']]);
    const context = { ...reviewContext, items: [stock] };

    expect(reviewMedicines(rows, {}, context)[0]).toMatchObject({
      status: 'match',
      candidates: [stock],
    });
    expect(reviewMedicines(rows, { 2: { stock: 'skip' } }, context)[0]).toMatchObject({
      status: 'existing',
    });
    expect(
      reviewMedicines(rows, { 2: { stock: 'distinct', feeId: '' } }, context)[0],
    ).toMatchObject({ status: 'ready', billing: { kind: 'new', amountMinor: 100000 } });
  });

  it('can reuse a compatible price with a blank cell under stock-only authority', () => {
    const rows = parsed([[fee.name, 'sachet', '', '', '']]);
    const context = { ...reviewContext, canCreatePrice: false };

    expect(reviewMedicines(rows, {}, context)[0]).toMatchObject({
      status: 'fix',
      suggestedFees: [fee],
    });
    expect(reviewMedicines(rows, { 2: { feeId: fee.id } }, context)[0]).toMatchObject({
      status: 'ready',
      billing: { kind: 'existing', fee },
    });
  });

  it('requires a new decision when the acknowledged central amount changes', () => {
    const rows = parsed([[fee.name, 'sachet', '', '', '110']]);
    const choices = { 2: { feeId: fee.id, keepCurrent: fee.amountMinor } };

    expect(reviewMedicines(rows, { 2: { feeId: fee.id } }, reviewContext)[0]).toMatchObject({
      status: 'fix',
    });
    expect(reviewMedicines(rows, choices, reviewContext)[0]).toMatchObject({ status: 'ready' });
    expect(
      reviewMedicines(rows, choices, {
        ...reviewContext,
        fees: [{ ...fee, amountMinor: 13000 }],
      })[0],
    ).toMatchObject({ status: 'fix' });
  });

  it('preserves source rows, ignores Issue, and blocks repeated item and unit keys', () => {
    const rows = parsed(
      [
        ['Zinc tablet', 'tablet', '', '', '0', 'previous issue'],
        [],
        ['Zinc tablet', 'tablet', '', '', '0'],
      ],
      [...MEDICINE_HEADERS, 'Issue'],
    );

    expect(rows.map((row) => row.line)).toEqual([2, 4]);
    expect(reviewMedicines(rows, {}, reviewContext).map((row) => row.status)).toEqual([
      'fix',
      'fix',
    ]);
  });
});
