import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The server and sync are stood in for: an accepted configuration save lands in local SQLite as sync would deliver it.
vi.mock('./configurationSave', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./configurationSave')>()),
  saveConfiguration: (await import('./configurationSave.localDouble')).saveConfigurationLocally,
}));

import { FeeItem, Location, ServiceDefinition, ServiceOffering, Staff, Unit } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests } from '@/lib/secureStorage';
import { sqliteTestDatabase } from './testing/sqliteDatabase';
import { setDatabaseForTests } from './database';
import { recordServerContact } from './deviceCredential';
import {
  loadCataloguePage,
  loadInvestigationCatalogue,
  linkInvestigationDefinition,
  selectInvestigation,
} from './repos/investigations';
import { rememberBillingCatalogue } from './billingCatalogueSupport';
import { ensureFacilityWorkspace } from './facilityWorkspaces';
import { listFeeItems } from './repos/billing';

const base = {
  facilityId: 'TEST',
  schemaVersion: 5,
  createdBy: 'staff:admin',
  deviceId: 'device:one',
  createdOn: '2026-11-01T08:00:00Z',
};

const admin = () =>
  authorizationFor({
    staff: { staffId: 'staff:admin', role: 'facility_admin', permission: 'read_write' },
    facilityId: 'TEST',
    deviceId: 'device:one',
  });

describe('lab test catalogue on the device', () => {
  let store: ReturnType<typeof sqliteTestDatabase>;

  it('requires the server projection before a classified test is selectable', async () => {
    await store.db.execute(
      'CREATE TABLE orderable_laboratory_tests(id TEXT PRIMARY KEY, facilityId TEXT)',
    );
    await seedTest('Draft screening');
    await seedTest('Free screening');
    await store.db.execute(
      'UPDATE service_definitions SET "laboratoryCatalogue" = ?, "orderable" = 0 WHERE name = ?',
      [
        JSON.stringify({ pricingCategory: 'billable', specimenTypes: ['Serum'] }),
        'Draft screening',
      ],
    );
    await store.db.execute(
      'UPDATE service_definitions SET "laboratoryCatalogue" = ? WHERE name = ?',
      [
        JSON.stringify({
          pricingCategory: 'non_billable',
          specimenTypes: ['Serum', 'Plasma'],
          specimenRequirement: 'any',
        }),
        'Free screening',
      ],
    );

    const before = await loadInvestigationCatalogue();
    expect(before.items).toEqual([]);
    expect(before.unavailableNames.has('draft screening')).toBe(true);
    await store.db.execute('INSERT INTO orderable_laboratory_tests VALUES (?, ?)', [
      'service_definition:Free screening',
      'TEST',
    ]);

    const after = await loadInvestigationCatalogue();
    expect(after.items.map(selectInvestigation)).toMatchObject([
      { name: 'Free screening', specimen: 'Serum or Plasma' },
    ]);
    expect(after.items.map(selectInvestigation)[0].feeItemId).toBeUndefined();
  });

  /** Catalogue entries arrive from the server by sync; tests seed them the same way. */
  const seedTest = async (name: string, aliases: string[] = [], facilityId = 'TEST') => {
    const id = `service_definition:${name}`;
    await store.seed(
      ServiceDefinition.parse({
        ...base,
        facilityId,
        id,
        type: 'service_definition',
        name,
        category: 'laboratory',
        concept: { system: 'local', code: id, label: name },
        orderable: true,
        active: true,
        revision: 1,
        investigation: { specimen: 'Serum', department: 'Chemistry', aliases },
      }),
    );

    await store.seed(
      ServiceOffering.parse({
        ...base,
        facilityId,
        id: `service_offering:${name}`,
        type: 'service_offering',
        serviceDefinitionId: id,
        unitId: 'unit:lab',
        name,
        locationIds: ['location:lab'],
        delivery: 'physical',
        requiredActions: ['perform_test', 'record_result'],
        intakePolicy: 'both',
        timeZone: 'Africa/Lagos',
        configuration: 'active',
        resourceReadiness: 'available',
        revision: 1,
      }),
    );
  };

  beforeEach(async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    resetSecureStorageForTests();
    recordServerContact(new Date(Date.now() - 60_000).toISOString());
    store = sqliteTestDatabase();
    setDatabaseForTests(store.db);
    await store.seed(
      Unit.parse({
        ...base,
        id: 'unit:lab',
        unitId: 'unit:lab',
        type: 'unit',
        name: 'Main laboratory',
      }),
    );

    await store.seed(
      Location.parse({
        ...base,
        id: 'location:lab',
        type: 'location',
        name: 'Laboratory room',
        kind: 'room',
      }),
    );

    await store.seed(
      Staff.parse({
        ...base,
        id: 'staff:admin',
        staffId: 'staff:admin',
        type: 'staff',
        fullName: 'Synthetic administrator',
        role: 'facility_admin',
        permission: 'read_write',
        active: true,
      }),
    );
  });

  afterEach(async () => {
    setDatabaseForTests(undefined);
    await store.db.close();
    vi.unstubAllGlobals();
  });

  it('pages, searches other names and sorts in the database, only for this facility', async () => {
    for (let i = 0; i < 30; i++) {
      await seedTest(`Test ${String(i).padStart(2, '0')}`, i === 7 ? ['Special alias'] : []);
    }

    await seedTest('Other facility test', [], 'OTHER');
    const first = await loadCataloguePage(admin(), { pageSize: 25 });
    expect(first.total).toBe(30);
    expect(first.items).toHaveLength(25);
    expect(first.items[0].definition.name).toBe('Test 00');
    expect(first.items[0].offering?.unitId).toBe('unit:lab');
    const second = await loadCataloguePage(admin(), { page: 1, pageSize: 25 });
    expect(second.items.map((row) => row.definition.name)).toEqual([
      'Test 25',
      'Test 26',
      'Test 27',
      'Test 28',
      'Test 29',
    ]);

    expect((await loadCataloguePage(admin(), { descending: true })).items[0].definition.name).toBe(
      'Test 29',
    );

    const search = await loadCataloguePage(admin(), { query: 'special' });
    expect(search.total).toBe(1);
    expect(search.items[0].definition.name).toBe('Test 07');
    expect((await loadCataloguePage(admin(), { query: '50%_' })).total).toBe(0);
  });

  it('links operational details to a centrally priced item without creating or changing a fee', async () => {
    await seedTest('Lipid profile');

    const fee = FeeItem.parse({
      ...base,
      id: 'fee:lipids',
      type: 'fee_item',
      name: 'Central lipids',
      category: 'laboratory',
      chargeWhen: 'when_ordered',
      amountMinor: 450000,
      currency: 'NGN',
      priceVersion: 'version:one',
      priceEvidenceVersion: 1,
    });

    await store.seed(fee);
    const [row] = (await loadCataloguePage(admin(), {})).items;
    await linkInvestigationDefinition(row.definition, fee.id, admin());
    expect(await listFeeItems()).toEqual([fee]);

    const item = selectInvestigation({
      fee,
      definition: undefined,
      offering: undefined,
      central: true,
    });

    expect(item).toMatchObject({
      feeItemId: fee.id,
      catalogueSource: 'billing',
      priceMinor: 450000,
      feePriceVersion: 'version:one',
    });

    expect(item.serviceDefinitionId).toBeUndefined();
  });

  it('refuses an operational association from staff who cannot manage services', async () => {
    await seedTest('Widal test');

    const nurse = authorizationFor({
      staff: { staffId: 'staff:nurse', role: 'nurse', permission: 'read_write' },
      facilityId: 'TEST',
      deviceId: 'device:one',
    });

    const [row] = (await loadCataloguePage(admin(), {})).items;
    await expect(
      linkInvestigationDefinition(row.definition, 'missing:fee', nurse),
    ).rejects.toThrow();

    expect(await listFeeItems()).toEqual([]);
  });

  it('retains an explicit legacy investigation profile during central discovery', async () => {
    await ensureFacilityWorkspace({
      facilityId: 'TEST',
      deviceId: 'device:one',
      credential: 'device:one.synthetic',
      syncEndpoint: 'http://localhost',
    });

    rememberBillingCatalogue(admin(), true);
    await seedTest('Existing profile');

    const fee = FeeItem.parse({
      ...base,
      id: 'fee:existing',
      type: 'fee_item',
      name: 'Central profile',
      category: 'laboratory',
      chargeWhen: 'when_ordered',
      amountMinor: 700000,
      currency: 'NGN',
      priceVersion: 'price:current',
      priceEvidenceVersion: 1,
    });

    await store.seed(fee);
    const offering = (await loadCataloguePage(admin(), {})).items[0].offering!;
    await store.db.execute('UPDATE service_offerings SET "feeItemId"=? WHERE id=?', [
      fee.id,
      offering.id,
    ]);

    const row = (await loadInvestigationCatalogue()).items.find(
      (i) => i.central && i.fee.id === fee.id,
    )!;

    expect(selectInvestigation(row)).toMatchObject({
      catalogueSource: 'billing',
      feeItemId: fee.id,
      offeringId: offering.id,
      serviceDefinitionId: offering.serviceDefinitionId,
      specimen: 'Serum',
    });

    expect((await loadCataloguePage(admin(), {})).items).toHaveLength(1);
    expect(await listFeeItems()).toEqual([fee]);
  });
});
