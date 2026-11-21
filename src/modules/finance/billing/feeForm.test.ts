import { describe, expect, it } from 'vitest';
import { feeDraftFromForm, feeFormValues } from './feeForm';

describe('basic Price Catalogue form', () => {
  it('creates only explicitly selected fees for every supported category', () => {
    for (const category of ['registration', 'card', 'consultation', 'laboratory', 'procedure', 'other'] as const) {
      expect(feeDraftFromForm({ name: ' Test item ', category, amount: '1500.29' }, 'ngn')).toMatchObject({
        name: 'Test item', category, amountMinor: 150029, currency: 'NGN', chargeWhen: 'when_ordered', departmentId: null, exemptions: [],
      });
    }
  });
  it('has three required fields, an optional description, and preserves zero prices', () => {
    expect(Object.keys(feeFormValues()).sort()).toEqual(['amount', 'category', 'description', 'name']);
    expect(feeDraftFromForm({ name: 'Free item', category: 'other', amount: '0' }).amountMinor).toBe(0);
  });
  it('inherits the supplied currency and rejects invalid money or an empty name', () => {
    expect(feeDraftFromForm({ name: 'Item', category: 'other', amount: '5' }, 'USD').currency).toBe('USD');
    expect(() => feeDraftFromForm({ name: '', category: 'other', amount: '5' })).toThrow();
    expect(() => feeDraftFromForm({ name: 'Item', category: 'other', amount: '-1' })).toThrow();
  });
});
