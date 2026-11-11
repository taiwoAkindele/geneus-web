import { useCallback, useRef, useState } from 'react';
import type { StockItem } from '@shared';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext } from '@/session';
import { listFeeItems } from '@/data/repos/billing';
import { linkStockPrice } from '@/data/repos/stock';
import { Button, SelectField, Sheet } from '@/ui';
import { formatMoney } from '@/lib/money';

export const StockPriceSheet = ({ item, onClose, onSaved }: { item: StockItem; onClose: () => void; onSaved: () => void }) => {
  const context = useAuthorizationContext(), fees = useLiveQuery(useCallback(listFeeItems, []));
  const [feeId, setFeeId] = useState(item.feeItemId ?? ''), [error, setError] = useState(''), [saving, setSaving] = useState(false), busy = useRef(false);
  const save = async () => {
    if (busy.current) return; busy.current = true; setSaving(true); setError('');
    try { await linkStockPrice(item.id, feeId || undefined, context); onSaved(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The price link could not be saved'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <Sheet title="Medicine selling price" eyebrow={item.name} onClose={onClose} closeDisabled={saving} hasUnsavedChanges={feeId !== (item.feeItemId ?? '')}><div className="space-y-4"><p>Choose the selling price for one {item.unitOfMeasure ?? 'recorded unit'}. Pharmacy will suggest this price when this stock item is supplied.</p><SelectField label="Selling price per stock unit" value={feeId} onChange={(e) => setFeeId(e.target.value)} options={[{ value: '', label: 'No price linked — supplies need billing follow-up' }, ...(fees.data ?? []).filter((f) => f.active).map((f) => ({ value: f.id, label: `${f.name} · ${formatMoney(f.amountMinor, f.currency)}` }))]} /><p className="text-sm text-ink-soft">Create or update selling prices in Billing → Fees. Linking a price changes neither existing bills nor stock counts.</p>{fees.error ? <p role="alert">Prices could not be read. Retry before saving.</p> : null}{error ? <p role="alert">{error}</p> : null}<Button disabled={saving || fees.loading || Boolean(fees.error)} onClick={() => void save()}>Save selling-price link</Button></div></Sheet>;
};
