import type { AuthorizationContext, StockItem, StockMovement } from '@shared';
import { allOfType, envelope, insertRecord, newId } from '../db';

export const listStockItems = () => allOfType<StockItem>('stock_item');
export const listStockMovements = () => allOfType<StockMovement>('stock_movement');

/** quantityOnHand is an opening balance. Later changes are immutable movements. */
export const stockBalances = (items: readonly StockItem[], movements: readonly StockMovement[]) => {
  const totals = new Map<string, number>();
  for (const movement of movements) totals.set(movement.itemId, (totals.get(movement.itemId) ?? 0) + movement.change);
  return items.map((item) => ({ ...item, balance: item.quantityOnHand + (totals.get(item.id) ?? 0) }));
};

export const stockMovementIssue = (change: number, reason: StockMovement['reason'], note?: string): string | undefined => {
  if (!Number.isFinite(change) || change === 0) return 'Enter a non-zero stock quantity.';
  if (reason === 'received' && change <= 0) return 'Received stock must increase the quantity.';
  if ((reason === 'dispensed' || reason === 'expired') && change >= 0) return 'Dispensed or expired stock must decrease the quantity.';
  if ((reason === 'adjustment' || reason === 'transfer') && !note?.trim()) return 'Give a reason for this adjustment or transfer.';
  return undefined;
};

export const createStockItem = async (draft: Pick<StockItem, 'name' | 'category' | 'unitOfMeasure' | 'quantityOnHand' | 'reorderLevel'>, context: AuthorizationContext) => {
  if (!draft.name.trim() || !draft.unitOfMeasure?.trim()) throw new Error('Enter an item name and unit of measure.');
  if ((await listStockItems()).some((item) => item.name.toLowerCase() === draft.name.trim().toLowerCase() && item.unitOfMeasure?.toLowerCase() === draft.unitOfMeasure?.trim().toLowerCase())) throw new Error('This item and unit of measure already exist. Open its stock record instead.');
  return insertRecord<StockItem>(context, 'stock_item:manage', 'stock_item', { ...envelope(context), id: newId('stock_item'), type: 'stock_item', ...draft, name: draft.name.trim(), unitOfMeasure: draft.unitOfMeasure.trim() });
};

export const recordStockMovement = async (draft: Pick<StockMovement, 'itemId' | 'change' | 'reason' | 'note'>, context: AuthorizationContext) => {
  const issue = stockMovementIssue(draft.change, draft.reason, draft.note);
  if (issue) throw new Error(issue);
  const items = await listStockItems();
  const item = items.find((candidate) => candidate.id === draft.itemId);
  if (!item) throw new Error('This stock item is not available on this device.');
  const [balance] = stockBalances([item], await listStockMovements());
  if (draft.change < 0 && balance.balance + draft.change < 0) throw new Error('This exceeds the stock recorded on this device. Check the physical count and record a reasoned adjustment if needed.');
  return insertRecord<StockMovement>(context, 'stock_movement:create', 'stock_movement', { ...envelope(context), id: newId('stock_movement'), type: 'stock_movement', ...draft, note: draft.note?.trim() || undefined, movedOn: new Date().toISOString() });
};
