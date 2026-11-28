import { LaboratoryPriceInput, type ServiceDefinition } from '@shared';
import { parseAmount } from '@/lib/money';

export const LAB_PRICE_HEADERS = [
  'Item ID',
  'Test name',
  'Billing unit',
  'Currency',
  'Revision',
  'Standard price',
] as const;

type PricePreviewRow = { line: number; name: string } & (
  | { status: 'blank' }
  | { status: 'ready'; input: LaboratoryPriceInput }
  | { status: 'error'; issue: string }
);

export const previewLaboratoryPrices = (
  [header = [], ...rows]: unknown[][],
  drafts: ServiceDefinition[],
  currency: string,
) => {
  const headings = header.map((cell) =>
    String(cell ?? '')
      .trim()
      .toLowerCase(),
  );
  const [id, name, , currencyColumn, revision, price] = LAB_PRICE_HEADERS.map((column) =>
    headings.indexOf(column.toLowerCase()),
  );

  if ([id, name, currencyColumn, revision, price].some((column) => column < 0)) {
    throw new Error('Use the Excel workbook exported from Needs pricing');
  }

  const seen = new Set<string>();

  return rows.flatMap<PricePreviewRow>((cells, index) => {
    if (!cells.some((cell) => String(cell ?? '').trim())) {
      return [];
    }

    const row = { line: index + 2, name: String(cells[name] ?? '').trim() };
    const standardPrice = String(cells[price] ?? '').trim();

    if (!standardPrice) {
      return [{ ...row, status: 'blank' }];
    }

    const definitionId = String(cells[id] ?? '').trim();
    const current = drafts.find((draft) => draft.id === definitionId);

    try {
      if (seen.has(definitionId)) {
        throw new Error('This item is listed twice');
      }

      seen.add(definitionId);

      if (!current || current.name !== row.name || current.revision !== Number(cells[revision])) {
        throw new Error('Item is missing or changed. Export a fresh copy');
      }

      if (String(cells[currencyColumn] ?? '').trim() !== currency) {
        throw new Error(`Use the facility currency (${currency})`);
      }

      const input = LaboratoryPriceInput.parse({
        definitionId,
        revision: current.revision,
        amountMinor: parseAmount(standardPrice, currency),
        currency,
      });
      return [{ ...row, status: 'ready', input }];
    } catch (cause) {
      return [
        {
          ...row,
          status: 'error',
          issue: cause instanceof Error ? cause.message : 'Review this row',
        },
      ];
    }
  });
};
