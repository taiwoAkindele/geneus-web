export const readExcel = async (file: File): Promise<unknown[][]> => {
  if (!/\.xlsx$/i.test(file.name) || file.size > 4 * 1024 * 1024) {
    throw new Error('Choose an Excel workbook (.xlsx) smaller than 4 MB');
  }

  const XLSX = await import('xlsx');
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: 'array',
    cellFormula: true,
    sheetRows: 502,
  });

  if (workbook.SheetNames.length !== 1) {
    throw new Error('Use one worksheet per upload');
  }

  const worksheet = workbook.Sheets[workbook.SheetNames[0]];

  if (Object.values(worksheet).some((cell) => cell && typeof cell === 'object' && 'f' in cell)) {
    throw new Error('Replace spreadsheet formulas with values before uploading');
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: true,
    range: 0,
  });

  if (rows.length > 501) {
    throw new Error('Upload up to 500 rows at a time');
  }

  return rows;
};

export const downloadExcel = async (
  filename: string,
  worksheetName: string,
  rows: readonly (readonly unknown[])[],
) => {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows.map((row) => [...row]));
  XLSX.utils.book_append_sheet(workbook, sheet, worksheetName);
  XLSX.writeFile(workbook, filename);
};
