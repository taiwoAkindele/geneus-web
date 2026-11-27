import { downloadCsv } from '@/lib/csv';

/**
 * Downloads rows as .xlsx or .csv. CSV text that a spreadsheet would run as a
 * formula is neutralised (see lib/csv). In .xlsx every text value is written
 * as a text cell, which a spreadsheet never evaluates, and no formula is ever
 * written. SheetJS is loaded only when a workbook is actually exported.
 */
export type ExportFormat = 'xlsx' | 'csv';

export type ExportCell = string | number | null | undefined;

export const downloadTable = async (
  fileName: string,
  sheetName: string,
  rows: readonly (readonly ExportCell[])[],
  format: ExportFormat = 'xlsx',
  instructions?: readonly (readonly ExportCell[])[],
) => {
  if (format === 'csv') {
    downloadCsv(fileName.replace(/\.xlsx$/i, '') + '.csv', rows);

    return;
  }

  const { utils, writeFile } = await import('xlsx');

  const sheet = utils.aoa_to_sheet(
    rows.map((row) => row.map((cell) => cell ?? '')),
    { cellDates: false },
  );

  for (const address of Object.keys(sheet)) {
    const cell = sheet[address] as { t?: string; f?: string } | undefined;

    if (address.startsWith('!') || !cell) {
      continue;
    }

    delete cell.f;
  }

  const book = utils.book_new();
  if (instructions?.length) {
    const guide = utils.aoa_to_sheet(instructions.map((row) => [...row]));
    guide['!cols'] = [{ wch: 30 }, { wch: 118 }, { wch: 27 }];
    utils.book_append_sheet(book, guide, 'Instructions');
    sheet['!cols'] = (rows[0] ?? []).map((heading) => ({
      wch: Math.max(16, String(heading).length + 4),
    }));
  }

  utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));

  writeFile(book, fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`, {
    compression: true,
    bookSST: true,
  });
};
