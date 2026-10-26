import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { StockItem, type StockMovement } from '@shared';
import { Button, DataTable, SelectField, Sheet, SheetCancelButton, Tag, TextAreaField, TextField } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { createStockItem, recordStockMovement, type stockBalances } from '@/data/repos/stock';
import { downloadCsv } from '@/lib/csv';
import { useStock } from './useStock';

const CATEGORIES = { drug: 'Medicine', vaccine: 'Vaccine', test_kit: 'Test kit', fp_commodity: 'Family planning commodity', consumable: 'Consumable', other: 'Other' };
const REASONS = { received: 'Received', dispensed: 'Dispensed / used', expired: 'Expired / damaged', adjustment: 'Physical count adjustment', transfer: 'Transfer' };
type StockBalance = ReturnType<typeof stockBalances>[number];
const level = (item: StockBalance) => item.balance < 0 ? 'Count discrepancy' : item.balance === 0 ? 'Out of stock' : item.reorderLevel !== undefined && item.balance <= item.reorderLevel ? 'Low stock' : 'In stock';

const StockForm = ({ item, onClose, onSaved }: { item?: StockBalance; onClose: () => void; onSaved: () => void }) => {
  const context = useAuthorizationContext();
  const [name, setName] = useState(''), [unit, setUnit] = useState(''), [quantity, setQuantity] = useState(''), [threshold, setThreshold] = useState('');
  const [category, setCategory] = useState<StockItem['category']>('drug');
  const [reason, setReason] = useState<StockMovement['reason']>('received');
  const [direction, setDirection] = useState('increase'), [note, setNote] = useState('');
  const [review, setReview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const saving = useRef(false);
  const amount = Number(quantity);
  const negative = reason === 'dispensed' || reason === 'expired' || ((reason === 'adjustment' || reason === 'transfer') && direction === 'decrease');
  const change = (negative ? -1 : 1) * amount;
  const check = () => {
    setError('');
    if (!quantity.trim() || !Number.isFinite(amount) || amount < 0 || (item && amount === 0)) { setError('Enter a valid quantity' + (item ? ' greater than zero.' : '.')); return; }
    if (!item && (!name.trim() || !unit.trim())) { setError('Enter the item name and unit of measure.'); return; }
    if (!item && threshold.trim() && (!Number.isFinite(Number(threshold)) || Number(threshold) < 0)) { setError('Enter a reorder level of zero or more.'); return; }
    if (item && ['adjustment', 'transfer'].includes(reason) && !note.trim()) { setError('Give a reason for the adjustment or transfer.'); return; }
    if (item && item.balance + change < 0) { setError('The quantity exceeds recorded stock. Check the physical count first.'); return; }
    setReview(true);
  };
  const save = async () => {
    if (saving.current || !review) return;
    saving.current = true; setBusy(true); setError('');
    try {
      if (item) await recordStockMovement({ itemId: item.id, change, reason, note }, context);
      else await createStockItem({ name, unitOfMeasure: unit, category, quantityOnHand: amount, reorderLevel: threshold.trim() ? Number(threshold) : undefined }, context);
      onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Stock could not be saved. Try again.'); }
    finally { saving.current = false; setBusy(false); }
  };
  const dirty = Boolean(name || unit || quantity || threshold || note);
  return <Sheet title={review ? 'Review stock entry' : item ? `Record movement · ${item.name}` : 'Add stock item'} onClose={onClose} hasUnsavedChanges={dirty} closeDisabled={busy}>
    {review ? <section className="space-y-3 text-sm"><h3 className="text-lg font-bold">{item?.name ?? name}</h3><p>{item ? REASONS[reason] : CATEGORIES[category]}</p><p className="text-xl font-bold">{item ? (change > 0 ? '+' : '') + change : amount} {item?.unitOfMeasure ?? unit}</p><p>{item ? `Recorded balance after this movement: ${item.balance + change}` : 'This is the opening balance. Later changes are recorded as movements.'}</p>{note ? <p>{note}</p> : null}<p className="text-ink-muted">This entry is attributed to you and saved on this device before upload. Saved movements cannot be edited.</p></section> : <div className="space-y-4">
      {!item ? <><TextField label="Item name" value={name} onChange={(event) => setName(event.target.value)} required /><SelectField label="Category" value={category} options={Object.entries(CATEGORIES).map(([value, label]) => ({ value, label }))} onChange={(event) => setCategory(event.target.value as typeof category)} /><TextField label="Unit of measure" value={unit} onChange={(event) => setUnit(event.target.value)} placeholder="e.g. tablets, packs or tests" required /><TextField label="Reorder level (optional)" type="number" min="0" step="any" value={threshold} onChange={(event) => setThreshold(event.target.value)} /></> : <><p className="text-sm text-ink-muted">Recorded balance: {item.balance} {item.unitOfMeasure ?? 'units'}. Use the same unit for every movement.</p><SelectField label="Movement type" value={reason} options={Object.entries(REASONS).map(([value, label]) => ({ value, label }))} onChange={(event) => setReason(event.target.value as typeof reason)} />{['adjustment', 'transfer'].includes(reason) ? <SelectField label="Direction" value={direction} options={[{ value: 'increase', label: 'Increase stock' }, { value: 'decrease', label: 'Decrease stock' }]} onChange={(event) => setDirection(event.target.value)} /> : null}</>}
      <TextField label={item ? 'Quantity moved' : 'Opening quantity'} type="number" min="0" step="any" required value={quantity} onChange={(event) => setQuantity(event.target.value)} />
      {item ? <TextAreaField label="Reason / reference" required={['adjustment', 'transfer'].includes(reason)} value={note} onChange={(event) => setNote(event.target.value)} placeholder="e.g. delivery reference or explanation of a counted difference" /> : null}
    </div>}
    {error ? <p role="alert" className="mt-4 rounded-field bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
    <div className="mt-5 flex flex-wrap gap-2"><Button fullWidth={false} className="flex-1" loading={busy} onClick={() => review ? void save() : check()}>{review ? 'Confirm & save stock entry' : 'Review stock entry'}</Button>{review ? <Button fullWidth={false} variant="outlined" disabled={busy} onClick={() => setReview(false)}>Keep editing</Button> : <SheetCancelButton disabled={busy} />}</div>
  </Sheet>;
};

export const StockWorkspace = () => {
  const context = useAuthorizationContext();
  const query = useStock();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false), [moving, setMoving] = useState(false);
  useEffect(() => { document.title = 'Medicine & stock · Geneus Health'; }, []);
  const search = params.get('q') ?? '', filter = params.get('level') ?? '';
  const item = query.data?.items.find((candidate) => candidate.id === params.get('item'));
  const shown = (query.data?.items ?? []).filter((candidate) => candidate.name.toLowerCase().includes(search.toLowerCase()) && (!filter || (filter === 'low' ? candidate.balance <= (candidate.reorderLevel ?? 0) : candidate.balance < 0))).sort((a, b) => a.balance - b.balance || a.name.localeCompare(b.name));
  const movements = (query.data?.movements ?? []).filter((movement) => movement.itemId === item?.id).sort((a, b) => b.movedOn.localeCompare(a.movedOn));
  const change = (key: string, value: string) => setParams((current) => { const next = new URLSearchParams(current); if (value) next.set(key, value); else next.delete(key); return next; });
  return <div className="mx-auto max-w-6xl space-y-5 px-4 py-5 md:px-7">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-[28px] font-extrabold">Medicine &amp; stock</h1><p className="mt-1 text-sm text-ink-muted">Opening balances and recorded movements · quantities on this device.</p></div>{context.permissions.includes('stock_item:manage') ? <Button fullWidth={false} onClick={() => setAdding(true)}>Add stock item</Button> : null}</header>
    <div className="grid gap-3 sm:grid-cols-2"><TextField label="Search stock" type="search" value={search} onChange={(event) => change('q', event.target.value)} /><SelectField label="Stock level" value={filter} options={[{ value: '', label: 'All items' }, { value: 'low', label: 'Low / out of stock' }, { value: 'discrepancy', label: 'Count discrepancies' }]} onChange={(event) => change('level', event.target.value)} /></div>
    {query.loading ? <p role="status">Reading stock records…</p> : query.error ? <div role="alert"><p>Stock could not be read from this device.</p><Button variant="ghost" onClick={query.reload}>Try again</Button></div> : <>
      {!shown.length ? <p className="rounded-card border border-dashed border-outline bg-white p-5 text-sm text-ink-muted">{query.data?.items.length ? 'No items match these filters.' : 'No stock items recorded yet. A facility administrator can add the items and opening balances.'}</p> : <DataTable caption="Recorded stock balances" rows={shown} rowKey={(row) => row.id} columns={[
        { key: 'name', label: 'Item', render: (row) => <button type="button" className="min-h-[44px] text-left font-bold text-brand" onClick={() => change('item', row.id)}>{row.name}<span className="mt-1 block text-xs font-normal text-ink-muted">{CATEGORIES[row.category]}</span></button> },
        { key: 'quantity', label: 'Recorded stock', render: (row) => <span className="font-mono">{row.balance} {row.unitOfMeasure ?? 'units'}</span> },
        { key: 'level', label: 'Level', render: (row) => <Tag tone={row.balance <= (row.reorderLevel ?? 0) ? 'amber' : 'green'}>{level(row)}</Tag> },
      ]} />}
      {item ? <section className="space-y-4 rounded-card border border-outline-soft bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{item.name}</h2><p className="mt-1 text-sm">Opening balance {item.quantityOnHand} · Current recorded balance {item.balance} {item.unitOfMeasure ?? 'units'}</p><p className="mt-1 text-xs text-ink-muted">Reorder level: {item.reorderLevel ?? 'Not set'}</p></div>{context.permissions.includes('stock_movement:create') ? <Button fullWidth={false} onClick={() => setMoving(true)}>Record movement</Button> : null}</div>{item.balance < 0 ? <p role="alert" className="rounded-field bg-amber-bg p-3 text-sm text-amber-text">Recorded movements exceed available stock. Check the physical count and record a reasoned adjustment. Original movements are retained.</p> : null}
        <Button fullWidth={false} variant="outlined" onClick={() => downloadCsv('stock-movements.csv', [['Item', 'Date', 'Change', 'Unit', 'Reason', 'Note', 'Recorded by'], ...movements.map((movement) => [item.name, movement.movedOn, movement.change, item.unitOfMeasure, REASONS[movement.reason], movement.note, query.data?.staff.find((staff) => staff.staffId === movement.createdBy)?.fullName ?? movement.createdBy])])}>Export movements</Button>
        {movements.length ? <DataTable caption="Stock movement history" rows={movements} rowKey={(row) => row.id} columns={[{ key: 'date', label: 'Date', render: (row) => new Date(row.movedOn).toLocaleString('en-GB') }, { key: 'change', label: 'Change', render: (row) => row.change }, { key: 'reason', label: 'Reason', render: (row) => <>{REASONS[row.reason]}<p className="mt-1 text-xs text-ink-muted">{row.note}</p></> }, { key: 'by', label: 'Recorded by', render: (row) => query.data?.staff.find((staff) => staff.staffId === row.createdBy)?.fullName ?? row.createdBy }]} /> : <p className="text-sm text-ink-muted">No movements recorded after the opening balance.</p>}
      </section> : params.get('item') ? <p role="alert">The selected item is not available on this device.</p> : null}
    </>}
    <p className="text-xs leading-relaxed text-ink-muted">Saved movements are permanent. Correct a counted difference with a new adjustment and a reason. Other devices' movements arrive when this device syncs; this is not a live physical count.</p>
    {adding ? <StockForm onClose={() => setAdding(false)} onSaved={query.reload} /> : null}
    {moving && item ? <StockForm item={item} onClose={() => setMoving(false)} onSaved={query.reload} /> : null}
  </div>;
};
