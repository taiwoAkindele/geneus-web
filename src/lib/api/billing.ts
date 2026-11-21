import type { AuthorizationContext, Payment, PaymentAllocation } from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { ApiError, staffRequest } from './client';
import { forgetStaffSession, staffSessionToken, touchStaffSession } from './staffSession';

export const billingRequest = async <T>(context: AuthorizationContext, path: string, body: Record<string, unknown>): Promise<T> => {
  const credential = getDeviceCredential();
  if (!credential) throw new Error('This device is not enrolled');
  try {
    // Who is acting travels only in the x-actor-staff-id header, beside the PIN-verified session; the server checks they match.
    // A caller can't name a different actor in the body: any such field is dropped.
    const { actorStaffId: _dropped, ...fields } = body;
    const result = await staffRequest<T>(`/billing/${path}`, credential.credential, staffSessionToken(context), fields, context.userId);
    touchStaffSession();
    return result;
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'staff_session_required') forgetStaffSession();
    throw cause;
  }
};
export const matchTransfer = (context: AuthorizationContext, id: string, patientId: string, allocations: PaymentAllocation[], requestId: string) =>
  billingRequest<Payment>(context, `transfers/${encodeURIComponent(id)}/match`, { patientId, allocations, requestId });

export type ReceivingAccount = { id: string; accountNumber: string; accountName: string; bankName: string; departmentId?: string; mode: string; general?:boolean };
export type BillingConnection = { configured: boolean; mode?: string; receivingAccountId?:string; accounts: ReceivingAccount[]; webhookPath: string; encryptionReady: boolean };
