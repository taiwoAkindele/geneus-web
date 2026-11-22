import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeeItem, type UploadRequest } from '@shared';
import { authorizationFor } from '@/auth/authorization';
import { ApiError, staffRequest } from '@/lib/api/client';
import { forgetStaffSession } from '@/lib/api/staffSession';
import { saveConfiguration } from './configurationSave';

vi.mock('./deviceCredential', () => ({
  getDeviceCredential: () => ({ credential: 'synthetic-device' }),
  lastServerContactOn: () => new Date().toISOString(),
}));

vi.mock('@/lib/api/staffSession', () => ({
  staffSessionToken: () => 'synthetic-session',
  forgetStaffSession: vi.fn(),
  touchStaffSession: vi.fn(),
}));

vi.mock('@/lib/api/client', async (original) => ({
  ...(await original<typeof import('@/lib/api/client')>()),
  staffRequest: vi.fn(),
}));

vi.mock('./db', () => ({
  findRecord: vi.fn(async () => ({ updatedOn: '2026-11-17T12:00:00.000Z' })),
}));

const context = authorizationFor({
  staff: { staffId: 'staff:admin', role: 'facility_admin', permission: 'read_write' },
  facilityId: 'TEST',
  deviceId: 'device:one',
});

const current = FeeItem.parse({
  id: 'fee:one',
  type: 'fee_item',
  facilityId: 'TEST',
  schemaVersion: 5,
  createdBy: context.userId,
  createdOn: '2026-11-16T12:00:00.000Z',
  deviceId: context.deviceId,
  name: 'Existing visit fee',
  category: 'consultation',
  amountMinor: 10000,
  currency: 'NGN',
  chargeWhen: 'every_visit',
  exemptions: [],
});

const metadata = { updatedBy: context.userId, updatedOn: '2026-11-17T12:00:00.000Z' };

describe('configuration save compatibility and stale editor protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('navigator', { onLine: true });
    vi.mocked(staffRequest).mockResolvedValue({ applied: [], duplicates: [], rejected: [] });
  });

  afterEach(() => vi.unstubAllGlobals());
  it('opts in to policy editing only for a narrow explicit policy patch', async () => {
    await saveConfiguration(context, [
      {
        op: 'patch',
        type: 'fee_item',
        id: current.id,
        current,
        changes: { chargeWhen: 'when_ordered', exemptions: [], ...metadata },
      },
    ]);

    expect(staffRequest).toHaveBeenCalledWith(
      '/config/save?billingPolicy=1',
      'synthetic-device',
      'synthetic-session',
      expect.anything(),
      context.userId,
    );
  });

  it('keeps ordinary and older full-form saves on the guarded endpoint and compares the displayed price', async () => {
    await saveConfiguration(context, [
      {
        op: 'patch',
        type: 'fee_item',
        id: current.id,
        current,
        changes: {
          name: 'Updated name',
          amountMinor: 12000,
          chargeWhen: 'every_visit',
          ...metadata,
        },
      },
    ]);

    const [path, , , body] = vi.mocked(staffRequest).mock.calls[0];
    expect(path).toBe('/config/save');
    expect((body as UploadRequest).mutations[0]).toMatchObject({
      previous: { amountMinor: 10000, chargeWhen: 'every_visit', name: 'Existing visit fee' },
    });
  });

  it('requires renewed proof after expiry without retrying or accepting the save', async () => {
    vi.mocked(staffRequest).mockRejectedValue(
      new ApiError('staff_session_required', 'Confirm your PIN', 403),
    );

    await expect(
      saveConfiguration(context, [
        {
          op: 'patch',
          type: 'fee_item',
          id: current.id,
          current,
          changes: { amountMinor: 12000, ...metadata },
        },
      ]),
    ).rejects.toMatchObject({ code: 'needs_pin' });

    expect(forgetStaffSession).toHaveBeenCalledOnce();
    expect(staffRequest).toHaveBeenCalledOnce();
  });
});
