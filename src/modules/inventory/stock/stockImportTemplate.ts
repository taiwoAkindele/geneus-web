export const MEDICINE_COLUMNS = {
  name: 'Name',
  unit: 'Unit',
  quantity: 'Opening quantity',
  reorderLevel: 'Reorder level',
  price: 'Price',
} as const;

export const MEDICINE_HEADERS = Object.values(MEDICINE_COLUMNS);
export const MEDICINE_LIMIT = 500;

export const MEDICINE_INSTRUCTIONS = [
  ['Import medicines into Geneus'],
  [
    '1. Fill in the Stock tab',
    'Start below the headings. Enter one row per medicine and stock unit.',
  ],
  [
    '2. Save and upload',
    `Keep the headings and save as .xlsx. Upload in Medicine & stock → Import medicines. Maximum ${MEDICINE_LIMIT} rows and 5 MB.`,
  ],
  [
    '3. Review and import',
    'Check the results, fix flagged rows, then confirm. Geneus skips medicines already in Stock.',
  ],
  [],
  ['Column', 'What to enter', 'Example'],
  [
    MEDICINE_COLUMNS.name,
    'Required. Include the strength and form where applicable.',
    'Paracetamol 500 mg tablet',
  ],
  [
    MEDICINE_COLUMNS.unit,
    'Required. Use the unit you count, stock and price. Use the same unit for both quantities.',
    'tablet',
  ],
  [
    MEDICINE_COLUMNS.quantity,
    'Count what you already have when you import. Leave blank if you have none.',
    200,
  ],
  [
    MEDICINE_COLUMNS.reorderLevel,
    'Geneus shows low stock when the balance reaches this number or falls below it. Blank means zero.',
    20,
  ],
  [
    MEDICINE_COLUMNS.price,
    'Enter the selling price for one stock unit in your facility currency. Leave blank to enter or link a price during review.',
    50,
  ],
  [],
  [
    'How the example works',
    'You have 200 tablets. Geneus flags low stock at 20 tablets or fewer. Each tablet sells for 50.',
  ],
  [
    'If you count in packs',
    'Enter the number of packs you have, the low stock limit in packs, and the price for one pack.',
  ],
  [
    'Number format',
    'Use zero or positive numbers. For the price, enter only the amount, without a currency symbol.',
  ],
] as const;
