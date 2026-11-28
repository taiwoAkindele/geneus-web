import { FeeCategory, FeeItem, type AuthorizationContext } from '@shared';
import { CATEGORY_LABELS } from './feeForm';
import { parseAmount } from '@/lib/money';
import { envelope, newId } from '@/data/db';
import type { ConfigurationWrite } from '@/data/configurationSave';

export type PriceImportRow = {
  line: number;
  name: string;
  category: string;
  price: string;
  description: string;
  itemId: string;
  error?: string;
  fee?: FeeItem;
  amountMinor?: number;
};

/** Spreadsheet column name for a zero-based index: 0 → A, 26 → AA. */
const columnLetter = (index: number): string =>
  (index >= 26 ? columnLetter(Math.floor(index / 26) - 1) : '') +
  String.fromCharCode(65 + (index % 26));

const categoryOf = (value: string) =>
  FeeCategory.options.find(
    (c) => c === value.toLowerCase() || CATEGORY_LABELS[c].toLowerCase() === value.toLowerCase(),
  );

export const previewPrices = (
  rows: readonly unknown[][],
  fees: readonly FeeItem[],
  currency: string,
  { allowNewLaboratoryFees = true }: { allowNewLaboratoryFees?: boolean } = {},
): PriceImportRow[] => {
  if (rows.length < 2) {
    throw new Error('Include a header and at least one price');
  }

  const headers = rows[0].map((v) =>
    String(v ?? '')
      .trim()
      .toLowerCase()
      .replace(/[ _-]/g, ''),
  );

  // Spreadsheets often keep empty columns beside the data too. A column with no heading is ignored when it is
  // empty, and refused when it holds values, so nothing typed is silently dropped.
  const blank = (v: unknown) => String(v ?? '').trim() === '';
  const width = Math.max(headers.length, ...rows.map((r) => r.length));

  for (let i = 0; i < width; i++) {
    if (!headers[i] && rows.slice(1).some((r) => !blank(r[i]))) {
      throw new Error(
        `Column ${columnLetter(i)} has values but no heading. Give it a heading or delete it.`,
      );
    }
  }

  const named = headers.filter(Boolean);

  if (['name', 'category', 'price'].some((h) => !named.includes(h))) {
    throw new Error('Required columns: Name, Category, Price. Optional: Description, Item ID.');
  }

  if (new Set(named).size !== named.length) {
    throw new Error('Each column heading can appear only once');
  }

  if (
    named.some(
      (h) => !['name', 'category', 'price', 'description', 'itemid', 'currency'].includes(h),
    )
  ) {
    throw new Error(
      'Use only Name, Category, Price, Description, Item ID and optional Currency columns',
    );
  }

  // Spreadsheets often keep thousands of empty rows below the data (formatted columns, touched cells); only items count.
  if (
    rows.slice(1).filter((cells) => cells.some((c) => String(c ?? '').trim() !== '')).length > 500
  ) {
    throw new Error('Upload at most 500 items at a time');
  }

  const seen = new Set<string>();
  const ids = new Set<string>();

  return rows.slice(1).flatMap((cells, index) => {
    if (cells.every((c) => String(c ?? '').trim() === '')) {
      return [];
    }

    const get = (key: string) => String(cells[headers.indexOf(key)] ?? '').trim();

    const row: PriceImportRow = {
      line: index + 2,
      name: get('name'),
      category: get('category'),
      price: get('price'),
      description: get('description'),
      itemId: get('itemid'),
    };

    try {
      if (get('currency') && get('currency').toUpperCase() !== currency) {
        throw new Error(`Use ${currency} prices in this upload`);
      }

      if (!row.name || !row.category || !row.price) {
        throw new Error('Name, Category and Price are required');
      }

      const category = categoryOf(row.category);

      if (!category) {
        throw new Error('Choose a central Billing category');
      }

      row.category = category;

      if (cells.some((c) => typeof c === 'string' && /^[=+@]/.test(c.trim()))) {
        throw new Error('Use plain values, without spreadsheet formulas');
      }

      const amountMinor = parseAmount(row.price, currency);

      if (amountMinor < 0) {
        throw new Error('Price cannot be negative');
      }

      const key = `${category}|${row.name.toLowerCase()}`;

      if (seen.has(key)) {
        throw new Error('Duplicate name and category in this file');
      }

      seen.add(key);
      const fee = row.itemId ? fees.find((f) => f.id === row.itemId) : undefined;

      if (!allowNewLaboratoryFees && category === 'laboratory' && !row.itemId) {
        throw new Error(
          'Create the test in Laboratory, then publish its first price under Needs pricing',
        );
      }

      if (row.itemId && !fee) {
        throw new Error('Item ID was not found on this device');
      }

      if (fee) {
        if (ids.has(fee.id)) {
          throw new Error('Duplicate Item ID');
        }

        ids.add(fee.id);

        if (fee.category !== category || fee.currency !== currency || fee.name !== row.name) {
          throw new Error('Existing items must keep their exact name, category and currency');
        }

        if (!fee.active) {
          throw new Error('This item is retired');
        }
      } else if (
        fees.some(
          (f) => f.category === category && f.name.trim().toLowerCase() === row.name.toLowerCase(),
        )
      ) {
        throw new Error('Item exists. Supply its Item ID to update its price');
      }

      FeeItem.pick({
        name: true,
        description: true,
        amountMinor: true,
        category: true,
        currency: true,
      }).parse({ name: row.name, description: row.description, amountMinor, category, currency });

      row.amountMinor = amountMinor;
      row.fee = fee;
    } catch (e) {
      row.error = e instanceof Error ? e.message : 'Invalid item';
    }

    return [row];
  });
};

/** Prepare once: retries reuse exact record IDs even when the response was lost. */
export const preparePriceWrites = (
  rows: readonly PriceImportRow[],
  context: AuthorizationContext,
  currency: string,
): ConfigurationWrite[] => {
  if (!rows.length || rows.some((r) => r.error)) {
    throw new Error('Fix every row before importing');
  }

  const stamp = envelope(context);

  return rows.map((r) =>
    r.fee
      ? {
          op: 'patch',
          type: 'fee_item',
          id: r.fee.id,
          current: r.fee,
          changes: {
            amountMinor: r.amountMinor,
            ...(r.description ? { description: r.description } : {}),
            updatedBy: context.userId,
            updatedOn: stamp.createdOn,
          },
        }
      : {
          op: 'put',
          type: 'fee_item',
          record: FeeItem.parse({
            ...stamp,
            id: newId('fee_item'),
            type: 'fee_item',
            name: r.name,
            description: r.description,
            category: r.category,
            amountMinor: r.amountMinor,
            currency,
            chargeWhen: 'when_ordered',
            exemptions: [],
            active: true,
          }),
        },
  );
};
