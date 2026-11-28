import {
  LaboratoryTestInput,
  labTestKey,
  type ResultTemplate,
  type ServiceDefinition,
} from '@shared';

export const LABORATORY_WORKBOOK_HEADERS = [
  'Test name',
  'Lab section',
  'Specimen types',
  'Specimen requirement',
  'Pricing category',
  'Other names',
  'Result template',
] as const;

export type LaboratoryWorkbookRow = {
  line: number;
  name: string;
  department: string;
  specimens: string[];
  requirement: string;
  pricing: string;
  aliases: string[];
  templateName: string;
};

export const laboratoryWorkbookRows = ([
  header = [],
  ...rows
]: unknown[][]): LaboratoryWorkbookRow[] => {
  const columns = header.map((value) => labTestKey(String(value ?? '')));
  const names = LABORATORY_WORKBOOK_HEADERS.map(labTestKey);
  const indexes = names.map((name) => columns.indexOf(name));
  const required = [0, 1, 2, 4];
  const missing = required.filter((index) => indexes[index] < 0);
  const priceColumn = columns.findIndex(
    (column) => column === 'price' || column === 'standard price',
  );

  if (priceColumn >= 0 && rows.some((row) => String(row[priceColumn] ?? '').trim())) {
    throw new Error('Publish prices in Billing → Prices → Needs pricing after importing the tests');
  }

  if (missing.length) {
    throw new Error(
      `Missing columns: ${missing.map((index) => LABORATORY_WORKBOOK_HEADERS[index]).join(', ')}`,
    );
  }

  return rows.flatMap((cells, index) => {
    if (!cells.some((cell) => String(cell ?? '').trim())) {
      return [];
    }

    const value = (column: number) => String(cells[indexes[column]] ?? '').trim();
    return [
      {
        line: index + 2,
        name: value(0),
        department: value(1),
        specimens: value(2)
          .split('|')
          .map((part) => part.trim())
          .filter(Boolean),
        requirement: value(3),
        pricing: value(4),
        aliases: value(5)
          .split(';')
          .map((part) => part.trim())
          .filter(Boolean),
        templateName: value(6),
      },
    ];
  });
};

const requirements: Record<string, string> = { 'any one': 'any', 'all listed': 'all' };
const categories: Record<string, string> = { billable: 'billable', 'non-billable': 'non_billable' };

export const previewLaboratoryWorkbook = (
  rows: LaboratoryWorkbookRow[],
  definitions: ServiceDefinition[],
  templates: ResultTemplate[],
) => {
  const taken = new Set(
    definitions
      .filter((test) => test.investigation && (test.active || test.laboratoryCatalogue))
      .flatMap((test) => [test.name, ...(test.investigation?.aliases ?? [])])
      .map(labTestKey),
  );

  return rows.map(
    (
      row,
    ):
      | { row: LaboratoryWorkbookRow; issue: string }
      | { row: LaboratoryWorkbookRow; input: LaboratoryTestInput } => {
      if (!row.name || !row.department || !row.specimens.length) {
        return { row, issue: 'Enter a test name, lab section and at least one specimen type' };
      }

      const templateName = labTestKey(row.templateName);
      const matchingTemplates = templates.filter(
        (template) => template.status === 'active' && labTestKey(template.name) === templateName,
      );
      const hasTemplate = templateName && templateName !== 'text result only';

      if (hasTemplate && matchingTemplates.length !== 1) {
        return { row, issue: 'Choose the name of one active result template' };
      }

      const pricingCategory = categories[labTestKey(row.pricing)];
      const specimenRequirement = requirements[labTestKey(row.requirement)];

      if (!pricingCategory) {
        return { row, issue: 'Choose Billable or Non-billable' };
      }

      if (row.requirement && !specimenRequirement) {
        return { row, issue: 'Use Any one or All listed for the specimen requirement' };
      }

      if (row.specimens.some((specimen) => /\s(?:or|and)\s/i.test(specimen))) {
        return {
          row,
          issue: 'List each specimen type separately using | and choose the specimen requirement',
        };
      }

      const parsed = LaboratoryTestInput.safeParse({
        name: row.name,
        department: row.department,
        aliases: row.aliases,
        catalogue: { pricingCategory, specimenTypes: row.specimens, specimenRequirement },
        resultTemplateId: hasTemplate ? matchingTemplates[0].id : undefined,
      });

      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return { row, issue: issue.message };
      }

      const keys = [parsed.data.name, ...parsed.data.aliases].map(labTestKey);

      if (keys.some((key) => taken.has(key))) {
        return {
          row,
          issue: 'This name or other name already appears in the catalogue or workbook',
        };
      }

      keys.forEach((key) => taken.add(key));
      return { row, input: parsed.data };
    },
  );
};
