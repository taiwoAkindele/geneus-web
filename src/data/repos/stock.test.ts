import { afterEach, describe, expect, it } from 'vitest';
import { POLICY_VERSION, StockItem, StockMovement, type AuthorizationContext } from '@shared';
import { setDatabaseForTests } from '../database';
import { fakeDatabase } from '../testing/fakeDatabase';
import { toRow } from '../rows';
import { createStockItem, recordStockMovement, stockBalances, stockMovementIssue } from './stock';
const at = new Date().toISOString();
const base = { facilityId: 'TEST', createdBy: 'staff:one', createdOn: at, deviceId: 'device:one' };
const item = StockItem.parse({ ...base, type: 'stock_item', id: 'stock:one', name: 'Gloves', unitOfMeasure: 'boxes', quantityOnHand: 10 });
const context: AuthorizationContext = { facilityId: 'TEST', deviceId: 'device:one', userId: 'staff:one', role: 'nurse', permissions: ['stock_movement:create'], policyVersion: POLICY_VERSION, lastServerContactOn: at };
afterEach(() => setDatabaseForTests(undefined));
describe('inventory repository', () => {
  it('derives balances from immutable movements and preserves negative discrepancies', () => {
    const movement = StockMovement.parse({ ...base, id: 'movement:one', type: 'stock_movement', itemId: item.id, change: -12, reason: 'dispensed', movedOn: at });
    expect(stockBalances([item], [movement])[0].balance).toBe(-2);
    expect(item.quantityOnHand).toBe(10);
    expect(stockMovementIssue(0, 'received')).toBeTruthy();
    expect(stockMovementIssue(1, 'dispensed')).toBeTruthy();
    expect(stockMovementIssue(-1, 'adjustment')).toBeTruthy();
  });
  it('refuses excess issue and unauthorized item setup before any SQLite write', async () => {
    const db = fakeDatabase({ stock_items: [toRow('stock_item', item)], stock_movements: [] }); setDatabaseForTests(db);
    await expect(recordStockMovement({ itemId: item.id, change: -11, reason: 'dispensed' }, context)).rejects.toThrow('exceeds');
    await expect(createStockItem({ name: 'New supplies', category: 'consumable', unitOfMeasure: 'packs', quantityOnHand: 0 }, context)).rejects.toThrow();
    expect(db.statements).toHaveLength(0);
    await recordStockMovement({ itemId: item.id, change: -2, reason: 'dispensed' }, context);
    expect(db.statements).toHaveLength(1);
    expect(db.statements[0].sql).toContain('INSERT INTO stock_movements');
  });
});
