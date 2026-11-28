import { FeeItem, StockItem, type AuthorizationContext } from '@shared';
import type { ConfigurationWrite } from '@/data/configurationSave';
import { envelope, newId } from '@/data/db';
import { formatMoney, parseAmount } from '@/lib/money';
import type { ParsedWorkbook } from '@/lib/tabular/parseWorkbook';
import { MEDICINE_COLUMNS, MEDICINE_HEADERS, MEDICINE_LIMIT } from './stockImportTemplate';

const ALTERNATE_HEADINGS = new Map([
  ['medicine name', MEDICINE_COLUMNS.name],
  ['stock unit', MEDICINE_COLUMNS.unit],
  ['stock on hand', MEDICINE_COLUMNS.quantity],
  ['low stock alert at', MEDICINE_COLUMNS.reorderLevel],
  ['selling price per unit', MEDICINE_COLUMNS.price],
]);

export type MedicineRow = {
  line: number;
  cells: string[];
  name: string;
  unit: string;
  quantity: string;
  reorderLevel: string;
  price: string;
};

export type MedicineChoice = {
  stock?: 'skip' | 'distinct';
  price?: string;
  feeId?: string;
  reviewedAmount?: number;
  keepCurrent?: number;
};

type MedicinePrice = { kind: 'existing'; fee: FeeItem } | { kind: 'new'; amountMinor: number };

export type MedicineReview = MedicineRow & {
  candidates: StockItem[];
  suggestedFees?: FeeItem[];
} & (
    | { status: 'existing'; message: string }
    | { status: 'match'; message: string }
    | { status: 'fix'; message: string; priceIssue?: 'resolve' | 'conflict' }
    | {
        status: 'ready';
        stock: Pick<StockItem, 'quantityOnHand' | 'reorderLevel'>;
        billing: MedicinePrice;
      }
  );

const normalize = (value: string) => value.trim().toLowerCase();
const stockKey = (name: string, unit: string) => JSON.stringify([normalize(name), normalize(unit)]);
const feeName = (row: MedicineRow) => `${row.name} (${row.unit})`;

export const readMedicineRows = (workbook: ParsedWorkbook): MedicineRow[] => {
  const dataSheets = workbook.sheets.filter((sheet) => normalize(sheet.name) !== 'instructions');
  const sheet = dataSheets.find((candidate) => normalize(candidate.name) === 'stock');
  const data = sheet ?? (dataSheets.length === 1 ? dataSheets[0] : undefined);

  if (!data) {
    throw new Error('Keep the medicines data in the Stock sheet of the Geneus template.');
  }

  if (data.truncatedRows || data.truncatedColumns || data.longCells > 0) {
    throw new Error('The spreadsheet exceeds the reading limits. Split it or shorten long cells.');
  }

  const [header = [], ...entries] = data.rows;
  const headings = header.map((value) => {
    const heading = normalize(value);

    return normalize(ALTERNATE_HEADINGS.get(heading) ?? heading);
  });
  const required = MEDICINE_HEADERS.map(normalize);
  const named = headings.filter(Boolean);
  const unknownHeading = named.some(
    (heading) => !required.includes(heading) && heading !== 'issue',
  );
  const unnamedValues = entries.some((cells) =>
    cells.some((value, index) => value && !headings[index]),
  );

  if (
    unknownHeading ||
    unnamedValues ||
    new Set(named).size !== named.length ||
    required.some((heading) => !headings.includes(heading))
  ) {
    throw new Error(
      "These headings are not the Geneus template's. Download the template and copy your data into it.",
    );
  }

  const rows = entries.flatMap((entry, index) => {
    const cells = required.map((heading) => entry[headings.indexOf(heading)] ?? '');
    const [name = '', unit = '', quantity = '', reorderLevel = '', price = ''] = cells;

    if (!cells.some(Boolean)) {
      return [];
    }

    return [{ line: index + 2, cells, name, unit, quantity, reorderLevel, price }];
  });

  if (!rows.length || rows.length > MEDICINE_LIMIT) {
    throw new Error(`Include between 1 and ${MEDICINE_LIMIT} medicine rows.`);
  }

  return rows;
};

const quantityFrom = (value: string, column: string): number => {
  if (!value) {
    return 0;
  }

  const number = Number(value);

  if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(number)) {
    throw new Error(`${column}: “${value}”. Enter zero or a positive quantity.`);
  }

  return number;
};

type ReviewContext = {
  items: readonly StockItem[];
  fees: readonly FeeItem[];
  currency: string;
  canCreatePrice: boolean;
};

export const eligibleMedicineFees = (fees: readonly FeeItem[], currency: string) =>
  fees.filter((fee) => fee.category === 'pharmacy' && fee.active && fee.currency === currency);

export const reviewMedicines = (
  rows: readonly MedicineRow[],
  choices: Readonly<Record<number, MedicineChoice>>,
  { items, fees, currency, canCreatePrice }: ReviewContext,
): MedicineReview[] => {
  const occurrences = new Map<string, number[]>();
  const eligibleFees = eligibleMedicineFees(fees, currency);

  for (const row of rows) {
    const key = stockKey(row.name, row.unit);
    occurrences.set(key, [...(occurrences.get(key) ?? []), row.line]);
  }

  return rows.map((row) => {
    const choice = choices[row.line];
    const name = normalize(row.name);
    const unit = normalize(row.unit);
    const candidates = name ? items.filter((item) => normalize(item.name) === name) : [];
    const base = { ...row, candidates };

    if (unit && candidates.some((item) => normalize(item.unitOfMeasure ?? '') === unit)) {
      return { ...base, status: 'existing', message: 'Matched by name and stock unit.' };
    }

    if (candidates.length && choice?.stock === 'skip') {
      return {
        ...base,
        status: 'existing',
        message: 'Skipped after reviewing the possible match.',
      };
    }

    if (candidates.length && choice?.stock !== 'distinct') {
      return {
        ...base,
        status: 'match',
        message: 'Confirm whether this medicine uses a different stock unit.',
      };
    }

    if (!name || !unit) {
      return {
        ...base,
        status: 'fix',
        message: !name
          ? `${MEDICINE_COLUMNS.name}: enter the full name.`
          : `${MEDICINE_COLUMNS.unit}: enter the unit you count.`,
      };
    }

    const duplicateLines = occurrences.get(stockKey(row.name, row.unit)) ?? [];

    if (duplicateLines.length > 1) {
      return {
        ...base,
        status: 'fix',
        message: `Medicine name and stock unit are duplicated on rows ${duplicateLines.join(', ')}.`,
      };
    }

    let stock: Pick<StockItem, 'quantityOnHand' | 'reorderLevel'>;

    try {
      stock = {
        quantityOnHand: quantityFrom(row.quantity, MEDICINE_COLUMNS.quantity),
        reorderLevel: quantityFrom(row.reorderLevel, MEDICINE_COLUMNS.reorderLevel),
      };
    } catch (cause) {
      return {
        ...base,
        status: 'fix',
        message: cause instanceof Error ? cause.message : 'Check the quantities.',
      };
    }

    const namedFee = normalize(feeName(row));
    const suggestedFees = eligibleFees.filter((fee) =>
      [name, namedFee].includes(normalize(fee.name)),
    );
    const priceError = (
      message: string,
      issue: 'resolve' | 'conflict' = 'resolve',
    ): MedicineReview => ({
      ...base,
      suggestedFees,
      status: 'fix',
      message,
      priceIssue: issue,
    });
    const price = choice?.price ?? row.price;
    let amountMinor: number | undefined;

    if (price.trim()) {
      try {
        amountMinor = parseAmount(price, currency);
      } catch (cause) {
        return priceError(
          `${MEDICINE_COLUMNS.price}: “${price}”. ${cause instanceof Error ? cause.message : 'Enter a valid amount.'}`,
        );
      }
    }

    const fee = eligibleFees.find((candidate) => candidate.id === choice?.feeId);

    if (fee) {
      if (choice?.reviewedAmount !== undefined && choice.reviewedAmount !== fee.amountMinor) {
        return priceError(
          `This price changed from ${formatMoney(choice.reviewedAmount, currency)} to ${formatMoney(fee.amountMinor, currency)}. Confirm the current price to continue.`,
          'conflict',
        );
      }

      if (
        amountMinor !== undefined &&
        amountMinor !== fee.amountMinor &&
        choice?.keepCurrent !== fee.amountMinor
      ) {
        return priceError(
          `Entered amount: ${formatMoney(amountMinor, currency)}. Current price: ${formatMoney(fee.amountMinor, currency)}. Choose which price to use.`,
          'conflict',
        );
      }

      return { ...base, suggestedFees, status: 'ready', stock, billing: { kind: 'existing', fee } };
    }

    if (choice?.feeId) {
      return priceError('The selected Pharmacy price is unavailable. Choose a current price.');
    }

    if (suggestedFees.length && choice?.feeId !== '') {
      return priceError(
        'Review the suggested Billing price and confirm it applies to this stock unit.',
      );
    }

    if (amountMinor === undefined) {
      return priceError(
        'Price needed. Enter the amount for one stock unit or link an existing Billing price.',
      );
    }

    if (!canCreatePrice) {
      return priceError(
        'You can link an existing price. Ask someone who manages prices to add a new one.',
      );
    }

    if (
      fees.some(
        (candidate) => candidate.category === 'pharmacy' && normalize(candidate.name) === namedFee,
      )
    ) {
      return priceError(
        'A Pharmacy price already uses this name and unit. Link an eligible price.',
      );
    }

    return {
      ...base,
      suggestedFees,
      status: 'ready',
      stock,
      billing: { kind: 'new', amountMinor },
    };
  });
};

export const prepareMedicineImport = (
  review: readonly MedicineReview[],
  context: AuthorizationContext,
  currency: string,
) => {
  const ready = review.filter((row) => row.status === 'ready');

  if (!ready.length || review.some((row) => row.status === 'fix' || row.status === 'match')) {
    throw new Error('Review every row before importing.');
  }

  const stamp = envelope(context);
  const fees: ConfigurationWrite[] = [];
  const stock: ConfigurationWrite[] = [];
  const amounts = new Map<string, number>();

  for (const row of ready) {
    let fee: FeeItem;

    if (row.billing.kind === 'existing') {
      fee = row.billing.fee;
    } else {
      fee = FeeItem.parse({
        ...stamp,
        id: newId('fee_item'),
        type: 'fee_item',
        name: feeName(row),
        category: 'pharmacy',
        amountMinor: row.billing.amountMinor,
        currency,
        chargeWhen: 'when_ordered',
        active: true,
      });
      fees.push({ op: 'put', type: 'fee_item', record: fee });
    }

    const item = StockItem.parse({
      ...stamp,
      ...row.stock,
      id: newId('stock_item'),
      type: 'stock_item',
      name: row.name,
      category: 'drug',
      unitOfMeasure: row.unit,
      feeItemId: fee.id,
    });

    stock.push({ op: 'put', type: 'stock_item', record: item });
    amounts.set(item.id, fee.amountMinor);
  }

  return {
    writes: [...fees, ...stock],
    amounts,
    added: ready.length,
    created: fees.length,
    linked: ready.length - fees.length,
    skipped: review.length - ready.length,
  };
};
