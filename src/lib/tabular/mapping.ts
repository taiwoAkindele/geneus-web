import type { ImportTemplate } from '@shared';

/**
 * Generic column mapping: an import kind names its fields and the words a
 * sheet might use for each; this finds the header row, suggests which column
 * holds each field, and recognises a saved template for the same layout.
 * Suggestions are only a starting point — a person sees and can change each one.
 */
export type FieldSpec = { key: string; label: string; required?: boolean; synonyms: readonly string[]; help?: string };
export type ColumnMapping = Record<string, number>;
export type MappedRow = { sourceRow: number; values: Record<string, string> };

export const normalizeHeader = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const columnLetter = (index: number): string => (index >= 26 ? columnLetter(Math.floor(index / 26) - 1) : '') + String.fromCharCode(65 + (index % 26));
export const columnName = (index: number, header?: string) => `Column ${columnLetter(index)}${header ? `: ${header}` : ''}`;

const headerScore = (header: string, field: FieldSpec): number => {
  const h = normalizeHeader(header);
  if (!h) return 0;
  let best = 0;
  for (const synonym of field.synonyms.map(normalizeHeader)) {
    if (h === synonym) best = Math.max(best, 3);
    else if (` ${h} `.includes(` ${synonym} `)) best = Math.max(best, 2);
    else if (synonym.length >= 4 && h.includes(synonym)) best = Math.max(best, 1);
  }
  return best;
};

/** The row, among the first twenty, that most looks like headers for these fields. */
export const detectHeaderRow = (rows: readonly (readonly string[])[], fields: readonly FieldSpec[]): number => {
  let best = { row: -1, score: 0 };
  for (let r = 0; r < Math.min(rows.length, 20); r++) {
    const cells = rows[r] ?? [];
    const matches = fields.reduce((n, field) => n + (cells.some((c) => headerScore(c, field) > 0) ? 1 : 0), 0);
    const text = cells.filter((c) => c && !/^[\d.,\s₦$-]+$/.test(c)).length;
    const score = matches * 10 + Math.min(text, 5);
    if (matches > 0 && score > best.score) best = { row: r, score };
  }
  return best.row >= 0 ? best.row : Math.max(0, rows.findIndex((row) => row.some((c) => c !== '')));
};

/** The likeliest column for each field, never the same column twice; stronger matches win. */
export const suggestMapping = (headers: readonly string[], fields: readonly FieldSpec[]): ColumnMapping => {
  const candidates = fields.flatMap((field) => headers.map((header, column) => ({ field: field.key, column, score: headerScore(header, field) }))).filter((c) => c.score > 0).sort((a, b) => b.score - a.score || a.column - b.column);
  const mapping: ColumnMapping = {}; const used = new Set<number>();
  for (const c of candidates) if (!(c.field in mapping) && !used.has(c.column)) { mapping[c.field] = c.column; used.add(c.column); }
  return mapping;
};

/** A saved template applies when its headers are this sheet's headers, in the same places. */
export const templateFits = (template: Pick<ImportTemplate, 'headers' | 'headerRow' | 'mapping'>, rows: readonly (readonly string[])[]): boolean => {
  const headers = (rows[template.headerRow] ?? []).map(normalizeHeader);
  return Object.values(template.mapping).every((column) => headers[column] !== undefined && headers[column] === template.headers[column]);
};

export const missingRequired = (mapping: ColumnMapping, fields: readonly FieldSpec[]) => fields.filter((f) => f.required && mapping[f.key] === undefined);

/** Data rows below the header, with their row number in the file (1-based, as a spreadsheet shows it). Blank rows are skipped. */
export const mappedRows = (rows: readonly (readonly string[])[], headerRow: number, mapping: ColumnMapping): MappedRow[] =>
  rows.slice(headerRow + 1).map((cells, i) => ({
    sourceRow: headerRow + 2 + i,
    values: Object.fromEntries(Object.entries(mapping).map(([key, column]) => [key, (cells[column] ?? '').trim()])),
  })).filter((row) => Object.values(row.values).some((v) => v !== ''));
