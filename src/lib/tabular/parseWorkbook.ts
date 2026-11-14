import { read, utils, type WorkSheet } from 'xlsx';
import { IMPORT_LIMITS } from '@shared';
import { inspectZip, isCompoundFile, isZip, verifyZipInflation } from './zipGuard';

/**
 * Reads a spreadsheet into plain text cells, nothing else. Formulas, styles,
 * macros, links and document properties are never read: a formula cell
 * contributes only the value it last showed. Every limit is enforced here, so
 * a file that passes yields at most `maxRows` × `maxColumns` short strings.
 * Pure and synchronous: it runs inside a worker (parse.worker.ts) and in tests.
 */
export type ParsedSheet = { name: string; rows: string[][]; truncatedRows: boolean; truncatedColumns: boolean; longCells: number };
export type ParsedWorkbook = { format: 'xlsx' | 'csv'; sheets: ParsedSheet[] };
export type TableLimits = { maxRows: number; maxColumns: number; maxCellChars: number; maxSheets: number; maxFileBytes: number };

export class TableFileError extends Error {
  constructor(message: string) { super(message); this.name = 'TableFileError'; }
}

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const pad = (n: number) => String(n).padStart(2, '0');

const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(Number(value.toPrecision(15))) : '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  return String(value).replace(CONTROL, '').replace(/\s+/g, ' ').trim();
};

const sheetRows = (sheet: WorkSheet, name: string, limits: TableLimits): ParsedSheet => {
  const full = utils.decode_range((sheet['!fullref'] as string | undefined) ?? sheet['!ref'] ?? 'A1:A1');
  const raw = utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '', blankrows: true });
  let longCells = 0;
  const rows = raw.slice(0, limits.maxRows + 1).map((row) => row.slice(0, limits.maxColumns).map((value) => {
    const text = cellText(value);
    if (text.length <= limits.maxCellChars) return text;
    longCells += 1;
    return text.slice(0, limits.maxCellChars);
  }));
  return {
    name, rows,
    truncatedRows: full.e.r - full.s.r + 1 > limits.maxRows + 1 || raw.length > limits.maxRows + 1,
    truncatedColumns: full.e.c - full.s.c + 1 > limits.maxColumns, longCells,
  };
};

export const parseWorkbook = (bytes: Uint8Array, fileName: string, limits: TableLimits = IMPORT_LIMITS): ParsedWorkbook => {
  if (!bytes.length) throw new TableFileError('The file is empty');
  if (bytes.length > limits.maxFileBytes) throw new TableFileError(`Choose a file up to ${Math.round(limits.maxFileBytes / 1024 / 1024)} MB`);
  if (isCompoundFile(bytes)) throw new TableFileError('Old .xls workbooks and password-protected files are not accepted. Save it as .xlsx or .csv');
  const options = { cellFormula: false, cellHTML: false, cellText: false, cellStyles: false, cellNF: false, cellDates: true, bookVBA: false, bookFiles: false, bookProps: false, bookDeps: false, sheetStubs: false, dense: true, sheetRows: limits.maxRows + 2, WTF: false } as const;
  let format: ParsedWorkbook['format'];
  let workbook: ReturnType<typeof read>;
  try {
    if (isZip(bytes)) {
      const check = inspectZip(bytes);
      if (!check.ok) throw new TableFileError(check.reason);
      format = 'xlsx';
      workbook = read(bytes, { ...options, type: 'array' });
    } else {
      if (!/\.(csv|txt)$/i.test(fileName)) throw new TableFileError('Choose an .xlsx or .csv file');
      if (bytes.includes(0)) throw new TableFileError('This file is not a text CSV');
      const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^﻿/, '');
      format = 'csv';
      // raw: every CSV value stays text, so nothing in it is ever read as a formula or a date.
      workbook = read(text, { ...options, type: 'string', raw: true });
    }
  } catch (cause) {
    if (cause instanceof TableFileError) throw cause;
    throw new TableFileError('The file could not be read. Check that it is a valid .xlsx or .csv file');
  }
  const names = workbook.SheetNames.slice(0, limits.maxSheets);
  if (!names.length) throw new TableFileError('The workbook has no sheets');
  return { format, sheets: names.map((name) => sheetRows(workbook.Sheets[name], name, limits)) };
};

/**
 * The worker's entry point: proves an .xlsx decompresses within the limits
 * (see verifyZipInflation) before parsing it. Parsing alone trusts the sizes
 * the file declares; this does not.
 */
export const parseWorkbookSafely = async (bytes: Uint8Array, fileName: string, limits: TableLimits = IMPORT_LIMITS): Promise<ParsedWorkbook> => {
  if (bytes.length > limits.maxFileBytes) throw new TableFileError(`Choose a file up to ${Math.round(limits.maxFileBytes / 1024 / 1024)} MB`);
  if (isZip(bytes)) {
    const proven = await verifyZipInflation(bytes);
    if (!proven.ok) throw new TableFileError(proven.reason);
  }
  return parseWorkbook(bytes, fileName, limits);
};
