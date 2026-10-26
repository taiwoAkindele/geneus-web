/** Quote every cell and neutralize spreadsheet formulas in user-entered text. */
export const csvText = (rows: readonly (readonly unknown[])[]): string => '\uFEFF' + rows.map((row) => row.map((value) => {
  const text = String(value ?? '');
  const safe = typeof value === 'number' ? text : /^[\s]*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}).join(',')).join('\r\n');

export const downloadCsv = (name: string, rows: readonly (readonly unknown[])[]) => {
  const url = URL.createObjectURL(new Blob([csvText(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
