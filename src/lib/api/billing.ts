import type { Payment, PaymentAllocation } from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { postAsDevice } from './client';

export const billingRequest = <T>(path: string, body: Record<string, unknown>): Promise<T> => {
  const credential = getDeviceCredential();
  if (!credential) return Promise.reject(new Error('This device is not enrolled'));
  return postAsDevice<T>(`/billing/${path}`, credential.credential, body);
};
export const matchTransfer = (id: string, patientId: string, allocations: PaymentAllocation[], actorStaffId: string, requestId: string) =>
  billingRequest<Payment>(`transfers/${encodeURIComponent(id)}/match`, { patientId, allocations, actorStaffId, requestId });

export type ReceivingAccount = { id: string; accountNumber: string; accountName: string; bankName: string; departmentId?: string; mode: string };
export type BillingConnection = { configured: boolean; mode?: string; accounts: ReceivingAccount[]; webhookPath: string; encryptionReady: boolean };
