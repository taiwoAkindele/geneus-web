import { useState } from 'react';
import { Button, DataTable, type TableColumn } from '@/ui';

/** Keep patient identity, location and actions together on narrow ward phones. */
export const WardTable = <T,>({ caption, rows, columns, rowKey }: { caption: string; rows: readonly T[]; columns: readonly TableColumn<T>[]; rowKey: (row: T) => string }) => {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const current = Math.min(page, pages - 1);
  return <>
    <div className="hidden md:block"><DataTable caption={caption} rows={rows} columns={columns} rowKey={rowKey} /></div>
    <section className="overflow-hidden rounded-card border border-outline-soft bg-white md:hidden" aria-label={caption}>
      <ul className="divide-y divide-outline-soft">{rows.slice(current * 25, (current + 1) * 25).map((row) => <li key={rowKey(row)} className="space-y-4 p-4">
        {columns.map((column) => <div key={column.key} className="min-w-0 break-words"><p className="mb-1 text-xs font-bold text-ink-soft">{column.label}</p>{column.render(row)}</div>)}
      </li>)}</ul>
      {pages > 1 ? <div className="space-y-2 border-t border-outline-soft p-4"><p className="text-sm">Page {current + 1} of {pages}</p><div className="flex gap-2"><Button variant="outlined" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button><Button variant="outlined" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Next</Button></div></div> : null}
    </section>
  </>;
};
