import type { OwnTest } from '@/lib/api/investigations';

export const TEST_CSV_HEADERS = ['Test name', 'Specimen', 'Classification', 'Other names'] as const;
/** A ready-to-fill file: the header row plus one example a facility can overwrite. */
export const TEST_CSV_TEMPLATE = `${TEST_CSV_HEADERS.join(',')}\nAntenatal booking panel,Blood and urine,Antenatal,ANC panel; Booking bloods\n`;

/** RFC 4180 fields: commas and line breaks inside double quotes, "" for a quote. */
const csvRows = (text: string): string[][] => {
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((cells) => cells.some((cell) => cell.trim()));
};

export type CsvIssue = { line: number; message: string };

/**
 * Reads an uploaded list of tests. Columns are found by header name in any order;
 * other names are separated by semicolons. Rows with problems are reported by line
 * and left out, so the rest can still be added.
 */
export const parseTestCsv = (text: string): { tests: OwnTest[]; issues: CsvIssue[] } => {
  const [header, ...body] = csvRows(text.replace(/^﻿/, ''));
  if (!header) return { tests: [], issues: [{ line: 1, message: 'The file is empty' }] };
  const index = (name: string) => header.findIndex((cell) => cell.trim().toLowerCase() === name.toLowerCase());
  const [name, specimen, classification, others] = TEST_CSV_HEADERS.map(index);
  const missing = TEST_CSV_HEADERS.slice(0, 3).filter((_, i) => [name, specimen, classification][i] < 0);
  if (missing.length) return { tests: [], issues: [{ line: 1, message: `Missing column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}` }] };
  const tests: OwnTest[] = [], issues: CsvIssue[] = [];
  body.forEach((cells, at) => {
    const line = at + 2, value = (i: number) => (i < 0 ? '' : cells[i] ?? '').trim();
    const blank = [['Test name', name], ['Specimen', specimen], ['Classification', classification]].filter(([, i]) => !value(i as number)).map(([label]) => label);
    if (blank.length) { issues.push({ line, message: `${blank.join(', ')} ${blank.length > 1 ? 'are' : 'is'} empty` }); return; }
    tests.push({ name: value(name), specimen: value(specimen), classification: value(classification), aliases: value(others).split(';').map((alias) => alias.trim()).filter(Boolean) });
  });
  return { tests, issues };
};
