import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizationFor } from '@/auth/authorization';
import { ApiError, staffRequest } from './client';
import { forgetStaffSession, touchStaffSession } from './staffSession';
import { billingRequest, matchTransfer } from './billing';

vi.mock('@/data/deviceCredential', () => ({ getDeviceCredential: () => ({ credential: 'synthetic-device' }), lastServerContactOn: () => new Date().toISOString() }));
vi.mock('./staffSession', () => ({ staffSessionToken: () => 'synthetic-session', forgetStaffSession: vi.fn(), touchStaffSession: vi.fn() }));
vi.mock('./client', async (original) => ({ ...(await original<typeof import('./client')>()), staffRequest: vi.fn() }));
const context = authorizationFor({ staff: { staffId: 'staff:cashier', role: 'cashier', permission: 'read_write' }, facilityId: 'TEST', deviceId: 'device:one' });

describe('verified online billing requests', () => {
  beforeEach(() => vi.clearAllMocks());
  it('sends the actor-bound session and preserves the allocation request identity', async () => {
    vi.mocked(staffRequest).mockResolvedValue({ id: 'payment:request' });
    await matchTransfer(context, 'transfer:one', 'TEST-000001-K2', [{ chargeId: 'charge:one', amountMinor: 1000 }], 'stable-request');
    expect(staffRequest).toHaveBeenCalledWith('/billing/transfers/transfer%3Aone/match', 'synthetic-device', 'synthetic-session', expect.objectContaining({ requestId: 'stable-request' }), context.userId);
    expect(vi.mocked(staffRequest).mock.calls[0][3]).not.toHaveProperty('actorStaffId');
    expect(touchStaffSession).toHaveBeenCalledOnce();
  });
  it('clears an expired session and never automatically replays a financial request', async () => {
    vi.mocked(staffRequest).mockRejectedValue(new ApiError('staff_session_required', 'Confirm your PIN', 403));
    await expect(billingRequest(context, 'connection', { actorStaffId: 'someone-else' })).rejects.toThrow('Confirm your PIN');
    expect(staffRequest).toHaveBeenCalledOnce();
    expect(forgetStaffSession).toHaveBeenCalledOnce();
    expect(touchStaffSession).not.toHaveBeenCalled();
    // The actor is the signed-in person, sent as the header argument; a body attempt to name someone else is dropped.
    expect(vi.mocked(staffRequest).mock.calls[0][3]).not.toHaveProperty('actorStaffId');
    expect(vi.mocked(staffRequest).mock.calls[0][4]).toBe(context.userId);
  });
});
