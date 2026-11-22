import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./configurationSave', async (original) => ({
  ...(await original<typeof import('./configurationSave')>()),
  saveConfiguration: (await import('./configurationSave.localDouble')).saveConfigurationLocally,
}));

import { FeeItem } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests } from '@/lib/secureStorage';
import { recordServerContact } from './deviceCredential';
import { sqliteTestDatabase } from './testing/sqliteDatabase';
import { setDatabaseForTests } from './database';
import { cataloguePage, newCharge } from './repos/billing';
import { rememberBillingCatalogue } from './billingCatalogueSupport';

const base = {
  facilityId: 'TEST',
  schemaVersion: 5,
  createdBy: 'staff:admin',
  deviceId: 'device:one',
  createdOn: '2026-11-18T08:00:00Z',
};

const context = authorizationFor({
  staff: { staffId: 'staff:admin', role: 'facility_admin', permission: 'read_write' },
  facilityId: 'TEST',
  deviceId: 'device:one',
});

const fee = (id: string, category: 'laboratory' | 'pharmacy' | 'maternity') =>
  FeeItem.parse({
    ...base,
    id,
    type: 'fee_item',
    name: id,
    category,
    amountMinor: 450000,
    currency: 'NGN',
    chargeWhen: 'when_ordered',
    priceVersion: 'price:' + id,
    priceEvidenceVersion: 1,
  });

describe('hospital-wide central catalogue and offline snapshots', () => {
  let store: ReturnType<typeof sqliteTestDatabase>;
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    resetSecureStorageForTests();
    recordServerContact(new Date().toISOString());
    store = sqliteTestDatabase();
    setDatabaseForTests(store.db);
  });

  afterEach(async () => {
    setDatabaseForTests(undefined);
    await store.db.close();
    vi.unstubAllGlobals();
  });

  it('searches across categories, optionally filters, escapes wildcards and preserves central IDs', async () => {
    for (const item of [
      fee('Full Blood Count', 'laboratory'),
      fee('Ceftriaxone', 'pharmacy'),
      fee('Delivery', 'maternity'),
    ]) {
      await store.seed(item);
    }

    expect((await cataloguePage({ facilityId: 'TEST' })).items.map((f) => f.id)).toEqual([
      'Ceftriaxone',
      'Delivery',
      'Full Blood Count',
    ]);

    expect((await cataloguePage({ search: 'cef', facilityId: 'TEST' })).items[0]).toMatchObject({
      id: 'Ceftriaxone',
      category: 'pharmacy',
      amountMinor: 450000,
    });

    expect((await cataloguePage({ category: 'laboratory', facilityId: 'TEST' })).total).toBe(1);
    expect((await cataloguePage({ search: '%', facilityId: 'TEST' })).total).toBe(0);
    expect((await cataloguePage({ facilityId: 'OTHER' })).total).toBe(0);
  });

  it('records explicit quantity/price evidence offline without changing its selected central fee', () => {
    const selected = fee('Ceftriaxone', 'pharmacy');
    rememberBillingCatalogue(context, true);

    const charge = newCharge(
      selected,
      { patientId: 'TEST-000001-K2', facts: { ageYears: 30 }, quantity: 3, unitOfMeasure: 'vials' },
      context,
    );

    expect(charge).toMatchObject({
      quantity: 3,
      unitPriceMinor: 450000,
      listPriceMinor: 1350000,
      feePriceVersion: selected.priceVersion,
      category: 'pharmacy',
      schemaVersion: 6,
    });

    expect(selected.amountMinor).toBe(450000);
  });

  it('keeps previously downloaded legacy prices usable while complete evidence is still syncing', () => {
    rememberBillingCatalogue(context, true);
    const selected = { ...fee('Legacy', 'laboratory'), priceEvidenceVersion: undefined };
    expect(newCharge(selected, { patientId: 'TEST-000001-K2', facts: {} }, context)).toMatchObject({
      schemaVersion: 5,
      listPriceMinor: 450000,
    });

    expect(() =>
      newCharge(selected, { patientId: 'TEST-000001-K2', facts: {}, quantity: 3 }, context),
    ).toThrow(/single-unit/);
  });
});
