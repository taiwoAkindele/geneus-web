import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  allocatedQuantity,
  patientStatement,
  ServiceChargeAllocation,
  type AuthorizationContext,
} from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests } from '@/lib/secureStorage';
import { billingRequest } from '@/lib/api/billing';
import { recordServerContact } from './deviceCredential';
import { sqliteTestDatabase } from './testing/sqliteDatabase';
import { setDatabaseForTests } from './database';
import { rememberIntegratedBilling } from './integratedBillingSupport';
import { requestServiceAllocation, listServiceAllocations } from './repos/serviceAllocations';
import { fetchPatientStatement, cachedPatientStatement } from './repos/patientStatements';
import { statementCsvRows } from '@/modules/finance/billing/PatientStatement';
import { csvText } from '@/lib/csv';

vi.mock('@/lib/api/billing', () => ({ billingRequest: vi.fn() }));

const context = (role: 'cashier' | 'pharmacy_staff' | 'facility_admin'): AuthorizationContext =>
  authorizationFor({
    staff: { staffId: 'staff:' + role, role, permission: 'read_write' },
    facilityId: 'TEST',
    deviceId: 'device:one',
  });

const input = {
  patientId: 'TEST-000001-K2',
  chargeId: 'charge:one',
  sourceKind: 'pharmacy' as const,
  sourceEntryId: 'supply:one',
  sourceItemId: 'supply:one',
  action: 'allocate' as const,
  quantity: 2,
  unit: 'tablets',
  reason: 'Exact source evidence reviewed',
  creditReturnedUnits: false,
};

describe('offline financial relationships and persisted statement snapshots in real SQLite', () => {
  let store: ReturnType<typeof sqliteTestDatabase>;
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    resetSecureStorageForTests();
    recordServerContact(new Date().toISOString());
    store = sqliteTestDatabase();
    setDatabaseForTests(store.db);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    setDatabaseForTests(undefined);
    await store.db.close();
    vi.unstubAllGlobals();
  });

  it('queues an attributed financial request offline, but never counts it as accepted capacity', async () => {
    const actor = context('cashier');
    rememberIntegratedBilling(actor, true);
    const a = await requestServiceAllocation(input, actor);
    expect(a.acceptedOn).toBeUndefined();
    expect(a.createdBy).toBe(actor.userId);
    expect(a.schemaVersion).toBe(7);
    expect(allocatedQuantity(await listServiceAllocations(), () => true)).toBe(0);
    await expect(requestServiceAllocation(input, actor)).rejects.toThrow(/unconfirmed/);
    expect((await listServiceAllocations()).length).toBe(1);
  });

  it('allows correction after a durable refusal without deleting the original request or clinical source', async () => {
    const actor = context('cashier');
    rememberIntegratedBilling(actor, true);
    const a = await requestServiceAllocation(input, actor);
    await store.db.execute(
      'INSERT INTO workforce_upload_receipts(id,clientId,outcome) VALUES(?,?,?)',
      [a.id, 1, 'rejected'],
    );

    expect(await listServiceAllocations()).toEqual([]);
    const corrected = await requestServiceAllocation(input, actor);
    expect(corrected.id).not.toBe(a.id);
    expect((await store.db.getAll('SELECT id FROM service_charge_allocations')).length).toBe(2);
  });

  it('denies clinical-only staff and unauthorized credits before any SQLite write', async () => {
    const pharmacy = context('pharmacy_staff');
    rememberIntegratedBilling(pharmacy, true);
    await expect(requestServiceAllocation(input, pharmacy)).rejects.toThrow();
    expect(await listServiceAllocations()).toEqual([]);
    const cashier = context('cashier');
    rememberIntegratedBilling(cashier, true);
    await expect(
      requestServiceAllocation(
        {
          ...input,
          action: 'release',
          reversesId: 'accepted:one',
          returnEntryId: 'return:one',
          creditReturnedUnits: true,
        },
        cashier,
      ),
    ).rejects.toThrow();

    expect(await listServiceAllocations()).toEqual([]);
  });

  it('waits for compatible-reader cutover and refuses unknown sub-millionth capacity', async () => {
    await expect(requestServiceAllocation(input, context('cashier'))).rejects.toThrow(/compatible/);

    const parsed = ServiceChargeAllocation.safeParse({
      ...input,
      id: 'test',
      type: 'service_charge_allocation',
      schemaVersion: 7,
      facilityId: 'TEST',
      deviceId: 'device:one',
      createdBy: 'staff:cashier',
      createdOn: new Date().toISOString(),
      quantity: 0.00000001,
    });

    expect(parsed.success).toBe(false);
  });

  it('cannot claim server confirmation or override the authenticated local author', async () => {
    const actor = context('cashier');
    rememberIntegratedBilling(actor, true);
    await expect(
      requestServiceAllocation({ ...input, acceptedOn: new Date().toISOString() } as never, actor),
    ).rejects.toThrow(/Only the server/);

    const a = await requestServiceAllocation(
      { ...input, createdBy: 'staff:forged' } as never,
      actor,
    );

    expect(a.createdBy).toBe(actor.userId);
    expect(a.acceptedOn).toBeUndefined();
  });

  it('persists the exact server-confirmed cutoff for offline viewing, printing and export', async () => {
    const actor = context('cashier');

    const s = patientStatement({
      patientId: input.patientId,
      patientName: 'Synthetic',
      facilityName: 'Synthetic hospital',
      currency: 'NGN',
      cutoff: '2026-11-18T10:00:00Z',
      generatedOn: '2026-11-18T10:00:01Z',
      charges: [],
      payments: [],
      adjustments: [],
      refunds: [],
      allocations: [],
      summaries: [],
      estimates: new Map(),
      claims: [],
    });

    vi.mocked(billingRequest).mockResolvedValue(s);
    expect(await fetchPatientStatement(actor, input.patientId, 'NGN')).toEqual(s);
    vi.mocked(billingRequest).mockRejectedValue(new Error('Offline'));
    expect(await cachedPatientStatement(actor, input.patientId, 'NGN')).toEqual(s);
    expect(await cachedPatientStatement(actor, input.patientId, 'USD')).toBeUndefined();
    const csv = csvText(statementCsvRows({ ...s, patientName: '=HYPERLINK("example")' }));
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain(s.cutoff);
  });
});
