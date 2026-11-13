import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';
import { parseWorkbook, TableFileError } from './parseWorkbook';
import { inspectZip, verifyZipInflation } from './zipGuard';
import { deflateRawSync } from 'node:zlib';
import { parseWorkbookSafely } from './parseWorkbook';
import { detectHeaderRow, mappedRows, missingRequired, suggestMapping, templateFits, type FieldSpec } from './mapping';
import { matchIndex, matchRecord } from './matching';

const xlsx = (rows: unknown[][], extra?: (sheet: ReturnType<typeof utils.aoa_to_sheet>) => void) => {
  const sheet = utils.aoa_to_sheet(rows); extra?.(sheet);
  const book = utils.book_new(); utils.book_append_sheet(book, sheet, 'Tariff');
  return new Uint8Array(write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
};
const csv = (text: string) => new TextEncoder().encode(text);

/** A zip with only a central directory: enough for the guard, which never decompresses. */
const fakeZip = (entries: { name: string; compressed: number; uncompressed: number; flags?: number }[]) => {
  const parts: number[] = [0x50, 0x4b, 0x03, 0x04, ...new Array(26).fill(0)];
  const offset = parts.length; const central: number[] = [];
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff]; const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  for (const e of entries) {
    const name = [...new TextEncoder().encode(e.name)];
    central.push(...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(e.flags ?? 0), ...u16(8), ...u32(0), ...u32(0), ...u32(e.compressed), ...u32(e.uncompressed), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...name);
  }
  return new Uint8Array([...parts, ...central, ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(entries.length), ...u16(entries.length), ...u32(central.length), ...u32(offset), ...u16(0)]);
};

describe('reading spreadsheets safely', () => {
  it('reads values, never formulas, and keeps row numbers', () => {
    const book = xlsx([['Service', 'Price'], ['Consultation', 1500], [], ['Malaria RDT', 0]], (sheet) => { sheet.C2 = { t: 'n', v: 3, f: 'SUM(1,2)' }; sheet['!ref'] = 'A1:C4'; });
    const [sheet] = parseWorkbook(book, 'tariff.xlsx').sheets;
    expect(sheet.rows[1]).toEqual(['Consultation', '1500', '3']);
    expect(sheet.rows[3]).toEqual(['Malaria RDT', '0', '']);
    expect(JSON.stringify(sheet)).not.toContain('SUM');
  });
  it('keeps CSV text as text, so a formula-like value is only ever data', () => {
    const [sheet] = parseWorkbook(csv('Service,Code,Price\r\n"=HYPERLINK(""http://example.org"")",+A1,"1,500.00"\r\n'), 'tariff.csv').sheets;
    expect(sheet.rows[1]).toEqual(['=HYPERLINK("http://example.org")', '+A1', '1,500.00']);
  });
  it('enforces row, column and cell limits instead of reading everything', () => {
    const limits = { maxRows: 3, maxColumns: 2, maxCellChars: 5, maxSheets: 2, maxFileBytes: 1_000_000 };
    const [sheet] = parseWorkbook(xlsx([['a', 'b', 'c'], ['1', 'abcdefghij'], ['2'], ['3'], ['4'], ['5']]), 'x.xlsx', limits).sheets;
    expect(sheet.rows.length).toBeLessThanOrEqual(4);
    expect([sheet.truncatedRows, sheet.truncatedColumns, sheet.longCells]).toEqual([true, true, 1]);
    expect(sheet.rows[1][1]).toBe('abcde');
    expect(() => parseWorkbook(new Uint8Array(2_000_000), 'x.csv', limits)).toThrow(TableFileError);
  });
  it('refuses old binary workbooks, unknown types and binary data posing as CSV', () => {
    expect(() => parseWorkbook(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), 'old.xls')).toThrow(/xls/);
    expect(() => parseWorkbook(csv('hello'), 'notes.docx')).toThrow(/xlsx or \.csv/);
    expect(() => parseWorkbook(new Uint8Array([65, 0, 66]), 'x.csv')).toThrow(/not a text CSV/);
  });
  it('refuses zip bombs, macros and encryption before decompressing anything', () => {
    expect(inspectZip(fakeZip([{ name: 'xl/workbook.xml', compressed: 1_000, uncompressed: 5_000 }])).ok).toBe(true);
    expect(inspectZip(fakeZip([{ name: 'xl/worksheets/sheet1.xml', compressed: 10_000, uncompressed: 500 * 1024 * 1024 }]))).toMatchObject({ ok: false, reason: expect.stringMatching(/unsafe size/) });
    expect(inspectZip(fakeZip(Array.from({ length: 50 }, (_, i) => ({ name: `p${i}`, compressed: 1_000_000, uncompressed: 2_000_000 }))))).toMatchObject({ ok: false });
    expect(inspectZip(fakeZip([{ name: 'xl/vbaProject.bin', compressed: 10, uncompressed: 10 }]))).toMatchObject({ ok: false, reason: expect.stringMatching(/macros/) });
    expect(inspectZip(fakeZip([{ name: 'xl/workbook.xml', compressed: 10, uncompressed: 10, flags: 1 }]))).toMatchObject({ ok: false, reason: expect.stringMatching(/password/) });
    expect(() => parseWorkbook(fakeZip([{ name: 'xl/vbaProject.bin', compressed: 10, uncompressed: 10 }]), 'm.xlsx')).toThrow(/macros/);
  });
});

const FIELDS: FieldSpec[] = [
  { key: 'name', label: 'Service', required: true, synonyms: ['service', 'service name', 'description'] },
  { key: 'payerCode', label: 'Code', synonyms: ['code', 'service code', 'hmo code'] },
  { key: 'price', label: 'Price', required: true, synonyms: ['price', 'tariff', 'amount', 'unit price'] },
];

/** A real zip with one deflated part whose directory can claim any size. */
const lyingZip = (content: Uint8Array, claimedSize: number) => {
  const data = deflateRawSync(content); const name = new TextEncoder().encode('xl/worksheets/sheet1.xml');
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff]; const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
  const local = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(8), ...u32(0), ...u32(0), ...u32(data.length), ...u32(claimedSize), ...u16(name.length), ...u16(0), ...name, ...data];
  const central = [...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(8), ...u32(0), ...u32(0), ...u32(data.length), ...u32(claimedSize), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(0), ...name];
  return new Uint8Array([...local, ...central, ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(1), ...u16(1), ...u32(central.length), ...u32(local.length), ...u16(0)]);
};

describe('proving decompressed size instead of trusting it', () => {
  it('accepts a genuine workbook', async () => {
    expect((await verifyZipInflation(xlsx([['Service', 'Price'], ['Consultation', 1500]])))).toMatchObject({ ok: true });
    const parsed = await parseWorkbookSafely(xlsx([['Service', 'Price'], ['Consultation', 1500]]), 't.xlsx');
    expect(parsed.sheets[0].rows[1]).toEqual(['Consultation', '1500']);
  });
  it('stops decompressing a part that produces more than it declared', async () => {
    const bomb = lyingZip(new Uint8Array(20 * 1024 * 1024), 1_000);
    expect(inspectZip(bomb).ok).toBe(true);
    expect(await verifyZipInflation(bomb)).toMatchObject({ ok: false, reason: expect.stringMatching(/unsafe size/) });
    await expect(parseWorkbookSafely(bomb, 'bomb.xlsx')).rejects.toThrow(/unsafe size/);
  });
  it('stops at the total limit even when every part tells the truth', async () => {
    const honest = lyingZip(new Uint8Array(3 * 1024 * 1024), 3 * 1024 * 1024);
    expect(await verifyZipInflation(honest, { maxEntries: 10, maxUncompressedBytes: 1024 * 1024, maxRatio: 1e9 })).toMatchObject({ ok: false });
  });
});

describe('mapping columns', () => {
  const rows = [['Synthetic HMO tariff 2026', '', ''], ['', '', ''], ['S/N', 'HMO Code', 'Service Description', 'Approved Tariff (₦)'], ['1', 'C-01', 'Consultation', '1,500'], ['', '', '', ''], ['2', 'L-02', 'Malaria RDT', '1000']];
  it('finds the header row under a title and suggests a column for each field', () => {
    const header = detectHeaderRow(rows, FIELDS);
    expect(header).toBe(2);
    const mapping = suggestMapping(rows[header], FIELDS);
    expect(mapping).toEqual({ payerCode: 1, name: 2, price: 3 });
    expect(missingRequired(mapping, FIELDS)).toEqual([]);
    expect(mappedRows(rows, header, mapping)).toEqual([
      { sourceRow: 4, values: { payerCode: 'C-01', name: 'Consultation', price: '1,500' } },
      { sourceRow: 6, values: { payerCode: 'L-02', name: 'Malaria RDT', price: '1000' } },
    ]);
  });
  it('reports a required field nothing matched', () => {
    expect(missingRequired(suggestMapping(['Item', 'Cost?'], FIELDS), FIELDS).map((f) => f.key)).toEqual(['name', 'price']);
  });
  it('recognises a saved template only for the same layout', () => {
    const template = { headerRow: 2, headers: ['s n', 'hmo code', 'service description', 'approved tariff'], mapping: { payerCode: 1, name: 2, price: 3 } };
    expect(templateFits(template, rows)).toBe(true);
    expect(templateFits(template, [[], [], ['S/N', 'Description', 'Code', 'Tariff']])).toBe(false);
  });
});

describe('matching services', () => {
  const index = matchIndex([
    { id: 'fee:consult', name: 'General consultation', codes: ['C-01'] },
    { id: 'fee:rdt', name: 'Malaria RDT' },
    { id: 'fee:fbc', name: 'Full blood count' },
    { id: 'fee:twin-a', name: 'Dressing' }, { id: 'fee:twin-b', name: 'dressing' },
  ]);
  it('matches exactly by id, recorded code or identical name', () => {
    expect(matchRecord(index, { id: 'fee:rdt', name: 'anything' })).toEqual({ kind: 'exact', id: 'fee:rdt', by: 'id' });
    expect(matchRecord(index, { code: 'c-01', name: 'Consult' })).toEqual({ kind: 'exact', id: 'fee:consult', by: 'code' });
    expect(matchRecord(index, { name: 'MALARIA  rdt.' })).toEqual({ kind: 'exact', id: 'fee:rdt', by: 'name' });
  });
  it('only suggests a near or ambiguous name, never deciding for the person', () => {
    const near = matchRecord(index, { name: 'Full blood count (FBC)' });
    expect(near.kind).toBe('suggested');
    expect(near.kind === 'suggested' && near.options[0].id).toBe('fee:fbc');
    const twins = matchRecord(index, { name: 'Dressing' });
    expect(twins.kind === 'suggested' && twins.options.map((o) => o.id).sort()).toEqual(['fee:twin-a', 'fee:twin-b']);
    expect(matchRecord(index, { name: 'Appendicectomy' })).toEqual({ kind: 'none' });
  });
});
