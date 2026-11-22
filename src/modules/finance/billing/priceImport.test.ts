import { it, expect } from 'vitest';
import { FeeItem } from '@shared';
import { previewPrices } from './priceImport';

const header = ['Name', 'Category', 'Price', 'Description', 'Item ID'];

const existing = FeeItem.parse({
  facilityId: 'TEST',
  createdBy: 'staff',
  createdOn: '2026-11-19T10:00:00Z',
  deviceId: 'device',
  id: 'fee:1',
  type: 'fee_item',
  name: 'Visit',
  category: 'consultation',
  currency: 'NGN',
  amountMinor: 10000,
  chargeWhen: 'every_visit',
  exemptions: [{ reason: 'Child', ageUnderYears: 5 }],
});

it('requires the three columns, permits optional descriptions and zero prices', () => {
  expect(() =>
    previewPrices(
      [
        ['Name', 'Price'],
        ['Item', 1],
      ],
      [],
      'NGN',
    ),
  ).toThrow(/Required/);

  const [row] = previewPrices(
    [header, ['Free service', 'Laboratory', '0', 'A description']],
    [],
    'NGN',
  );

  expect(row.error).toBeUndefined();
  expect(row.category).toBe('laboratory');
  expect(row.amountMinor).toBe(0);
  expect(row.description).toBe('A description');
});

it('requires exact existing IDs and rejects implicit duplicate-name updates', () => {
  expect(
    previewPrices([header, ['Visit', 'consultation', '200']], [existing], 'NGN')[0].error,
  ).toMatch(/Item ID/);

  const row = previewPrices(
    [header, ['Visit', 'Consultation', '200', '', 'fee:1']],
    [existing],
    'NGN',
  )[0];

  expect(row.error).toBeUndefined();
  expect(row.fee?.chargeWhen).toBe('every_visit');
  expect(row.fee?.exemptions).toEqual(existing.exemptions);
});

it.each([
  ['Visit', 'Laboratory', '100', '', 'fee:1'],
  ['Renamed', 'Consultation', '100', '', 'fee:1'],
  ['New', 'Other', '-1'],
  ['New', 'Unknown', '100'],
  ['=1+1', 'Other', '100'],
  ['New', 'Other', 'abc'],
  ['New', 'Other', '100', '', 'missing'],
])('rejects unsafe import row %j', (...cells) => {
  expect(previewPrices([header, cells], [existing], 'NGN')[0].error).toBeTruthy();
});

it('rejects duplicate rows and oversized files', () => {
  const rows = previewPrices(
    [header, ['New', 'other', '100'], [' new ', 'other', '100']],
    [],
    'NGN',
  );

  expect(rows[1].error).toMatch(/Duplicate/);
  expect(() =>
    previewPrices(
      [header, ...Array.from({ length: 501 }, () => ['Item', 'other', '1'])],
      [],
      'NGN',
    ),
  ).toThrow(/500/);
});

it('ignores the empty rows spreadsheets keep below the data when applying the 500-item limit', () => {
  const items = Array.from({ length: 45 }, (_, i) => [`Item ${i}`, 'laboratory', '100']);
  const blanks = Array.from({ length: 5000 }, () => ['', '', '']);
  const rows = previewPrices([header, ...items, ...blanks], [], 'NGN');
  expect(rows).toHaveLength(45);
  expect(rows.every((r) => !r.error)).toBe(true);
  expect(() =>
    previewPrices(
      [header, ...Array.from({ length: 501 }, (_, i) => [`Item ${i}`, 'other', '1']), ...blanks],
      [],
      'NGN',
    ),
  ).toThrow(/500/);
});

it('ignores empty unnamed columns beside the data, and refuses values under no heading', () => {
  const rows = previewPrices(
    [
      [...header, '', '', ''],
      ['New lab test', 'laboratory', '100', '', '', '', ''],
      ['Another', 'laboratory', '200', '', '', '', ''],
    ],
    [],
    'NGN',
  );

  expect(rows).toHaveLength(2);
  expect(rows.every((r) => !r.error)).toBe(true);
  expect(() =>
    previewPrices(
      [
        [...header, ''],
        ['Item', 'laboratory', '100', '', '', 'oops'],
      ],
      [],
      'NGN',
    ),
  ).toThrow(/Column F has values but no heading/);

  expect(() =>
    previewPrices(
      [
        [...header, 'Price'],
        ['Item', 'laboratory', '100', '', '', '5'],
      ],
      [],
      'NGN',
    ),
  ).toThrow(/only once/);
});

it('refuses a foreign currency column and unknown policy columns', () => {
  expect(
    previewPrices(
      [
        ['Name', 'Category', 'Price', 'Currency'],
        ['Imported', 'other', '1', 'USD'],
      ],
      [],
      'NGN',
    )[0].error,
  ).toMatch(/NGN/);

  expect(() =>
    previewPrices(
      [
        ['Name', 'Category', 'Price', 'Charge when'],
        ['Imported', 'other', '1', 'every_visit'],
      ],
      [],
      'NGN',
    ),
  ).toThrow(/only/);
});
