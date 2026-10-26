import { expect, it } from 'vitest';
import { csvText } from './csv';
it('quotes multiline values and prevents spreadsheet formulas while preserving numeric negatives', () => {
  const text = csvText([['=SUM(1,2)', 'line\n"quoted"', -3]]);
  expect(text).toContain('"\'=SUM(1,2)"');
  expect(text).toContain('"line\n""quoted"""');
  expect(text).toContain('"-3"');
});
