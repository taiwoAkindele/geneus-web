import type { AuthorizationContext, Payment, PaymentAllocation } from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { ApiError, staffRequest } from './client';
import { forgetStaffSession, staffSessionToken, touchStaffSession } from './staffSession';

export const billingRequest = async <T>(context: AuthorizationContext, path: string, body: Record<string, unknown>): Promise<T> => {
  const credential = getDeviceCredential();
  if (!credential) throw new Error('This device is not enrolled');
  try {
    const result = await staffRequest<T>(`/billing/${path}`, credential.credential, staffSessionToken(context), { ...body, actorStaffId: context.userId }, context.userId);
    touchStaffSession();
    return result;
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'staff_session_required') forgetStaffSession();
    throw cause;
  }
};
export const matchTransfer = (context: AuthorizationContext, id: string, patientId: string, allocations: PaymentAllocation[], requestId: string) =>
  billingRequest<Payment>(context, `transfers/${encodeURIComponent(id)}/match`, { patientId, allocations, requestId });

export type ReceivingAccount = { id: string; accountNumber: string; accountName: string; bankName: string; departmentId?: string; mode: string };
export type BillingConnection = { configured: boolean; mode?: string; accounts: ReceivingAccount[]; webhookPath: string; encryptionReady: boolean };
