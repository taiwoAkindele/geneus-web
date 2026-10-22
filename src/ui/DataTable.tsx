import { useMemo, useState, type ReactNode } from 'react';

export type TableColumn<T> = {
  key: string;
  label: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'right';
};

type Props<T> = {
  caption: string;
  rows: readonly T[];
  columns: readonly TableColumn<T>[];
  rowKey: (row: T) => string;
  selectedKey?: string;
};

/** Repeated records align on desktop; each screen supplies its phone presentation. */
export const DataTable = <T,>({ caption, rows, columns, rowKey, selectedKey }: Props<T>) => {
  const [sort, setSort] = useState<{ key: string; descending: boolean }>();
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const shown = useMemo(() => {
    const column = columns.find((candidate) => candidate.key === sort?.key);
    if (!column?.sortValue) return rows;
    const value = column.sortValue;
    return [...rows].sort((a, b) => {
      const first = value(a), second = value(b);
      const comparison = typeof first === 'number' && typeof second === 'number'
        ? first - second : String(first).localeCompare(String(second), undefined, { numeric: true });
      return comparison * (sort?.descending ? -1 : 1);
    });
  }, [rows, columns, sort]);

  const activePage = Math.max(0, Math.min(page, Math.ceil(shown.length / pageSize) - 1));
  const visible = shown.slice(activePage * pageSize, (activePage + 1) * pageSize);
  return (
    <div className="overflow-x-auto rounded-card border border-outline-soft bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-outline bg-surface-container text-[12px] text-ink-soft">
          <tr>{columns.map((column) => (
            <th key={column.key} scope="col" className={`px-4 py-2 font-bold ${column.align === 'right' ? 'text-right' : ''}`}
              aria-sort={column.sortValue ? sort?.key === column.key ? sort.descending ? 'descending' : 'ascending' : 'none' : undefined}>
              {column.sortValue ? (
                <button type="button" className="inline-flex min-h-[44px] items-center gap-2 text-left"
                  onClick={() => { setPage(0); setSort({ key: column.key, descending: sort?.key === column.key ? !sort.descending : false }); }}>
                  {column.label}<span aria-hidden>{sort?.key === column.key ? sort.descending ? '↓' : '↑' : '↕'}</span>
                </button>
              ) : column.label}
            </th>
          ))}</tr>
        </thead>
        <tbody className="divide-y divide-outline-soft">
          {visible.map((row) => (
            <tr key={rowKey(row)} aria-selected={selectedKey === undefined ? undefined : rowKey(row) === selectedKey}
              className={rowKey(row) === selectedKey ? 'bg-brand-wash' : 'hover:bg-surface focus-within:bg-brand-wash'}>
              {columns.map((column) => <td key={column.key} className={`px-4 py-3 align-top ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}>{column.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length > pageSize ? <div className="flex items-center justify-between gap-3 border-t border-outline-soft px-4 py-2 text-[13px]"><span>{activePage * pageSize + 1}–{Math.min((activePage + 1) * pageSize, shown.length)} of {shown.length}</span><div className="flex gap-3"><button type="button" className="min-h-[44px] px-2 font-bold text-brand disabled:text-ink-muted" disabled={activePage === 0} onClick={() => setPage(activePage - 1)}>Previous</button><button type="button" className="min-h-[44px] px-2 font-bold text-brand disabled:text-ink-muted" disabled={(activePage + 1) * pageSize >= shown.length} onClick={() => setPage(activePage + 1)}>Next</button></div></div> : null}
    </div>
  );
};
