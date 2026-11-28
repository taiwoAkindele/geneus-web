import { describe, expect, it } from 'vitest';
import {
  LABORATORY_WORKBOOK_HEADERS,
  laboratoryWorkbookRows,
  previewLaboratoryWorkbook,
} from './laboratoryWorkbook';

describe('Laboratory test Excel preview', () => {
  it('keeps line numbers and distinguishes free, billable, and invalid rows', () => {
    const rows = laboratoryWorkbookRows([
      [...LABORATORY_WORKBOOK_HEADERS],
      ['Free screen', 'Chemistry', 'Urine', '', 'Non-billable'],
      [],
      ['Paired test', 'Chemistry', 'Serum | Plasma', 'All listed', 'Billable'],
      ['Missing rule', 'Chemistry', 'Serum | Plasma', '', 'Billable'],
      ['Ambiguous specimen', 'Chemistry', 'Blood and urine', '', 'Billable'],
      ['Paired test', 'Chemistry', 'Serum', '', 'Non-billable'],
    ]);

    expect(previewLaboratoryWorkbook(rows, [], [])).toMatchObject([
      {
        row: { line: 2 },
        input: { catalogue: { pricingCategory: 'non_billable', specimenTypes: ['Urine'] } },
      },
      {
        row: { line: 4 },
        input: {
          catalogue: {
            pricingCategory: 'billable',
            specimenTypes: ['Serum', 'Plasma'],
            specimenRequirement: 'all',
          },
        },
      },
      { row: { line: 5 }, issue: expect.stringContaining('requirement') },
      { row: { line: 6 }, issue: expect.stringContaining('separately') },
      { row: { line: 7 }, issue: expect.stringContaining('already appears') },
    ]);
  });
});
