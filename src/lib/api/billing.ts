import type {
  AuthorizationContext,
  DocumentLinkRequest,
  DocumentLinkResponse,
  DocumentLinkStopResponse,
  Payment,
  PaymentAllocation,
  SendToPatientRequest,
  SendToPatientResponse,
} from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { ApiError, staffRequest } from './client';
import { forgetStaffSession, staffSessionToken, touchStaffSession } from './staffSession';

export const billingRequest = async <T>(
  context: AuthorizationContext,
  path: string,
  body: Record<string, unknown>,
): Promise<T> => {
  const credential = getDeviceCredential();

  if (!credential) {
    throw new Error('This device is not enrolled');
  }

  try {
    // Who is acting travels only in the x-actor-staff-id header, beside the PIN-verified session; the server checks they match.
    // A caller can't name a different actor in the body: any such field is dropped.
    const { actorStaffId: _dropped, ...fields } = body;

    const result = await staffRequest<T>(
      `/billing/${path}`,
      credential.credential,
      staffSessionToken(context),
      fields,
      context.userId,
    );

    touchStaffSession();

    return result;
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'staff_session_required') {
      forgetStaffSession();
    }

    throw cause;
  }
};

export const matchTransfer = (
  context: AuthorizationContext,
  id: string,
  patientId: string,
  allocations: PaymentAllocation[],
  requestId: string,
) =>
  billingRequest<Payment>(context, `transfers/${encodeURIComponent(id)}/match`, {
    patientId,
    allocations,
    requestId,
  });

export type ReceivingAccount = {
  id: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  departmentId?: string;
  mode: string;
  general?: boolean;
};

export type BillingConnection = {
  configured: boolean;
  provider?: string;
  mode?: string;
  receivingAccountId?: string;
  accounts: ReceivingAccount[];
  webhookPath: string;
  encryptionReady: boolean;
};

/** A payment provider as the server describes it; the setup screen is drawn from this. Never contains secrets. */
export type ProviderDescriptor = {
  id: string;
  name: string;
  countries: string[];
  currencies: string[];
  credentialFields: {
    key: string;
    label: string;
    secret: boolean;
    pattern?: string;
    help?: string;
  }[];
  accountFields: {
    key: string;
    label: string;
    type: 'email' | 'tel' | 'text' | 'select';
    pattern?: string;
    help?: string;
    sensitive?: boolean;
    options?: { value: string; label: string }[];
  }[];
  can: { createAccount: boolean; listAccounts: boolean; verifyByReference: boolean };
};

/** A link the patient opens without signing in: their bill or a receipt. Bill links last 30 days, receipts a year. */
export const patientDocumentLink = (context: AuthorizationContext, request: DocumentLinkRequest) =>
  billingRequest<DocumentLinkResponse>(context, 'documents/link', request);

/** Stops every open patient link to this bill or receipt. */
export const stopPatientDocumentLinks = (
  context: AuthorizationContext,
  request: DocumentLinkRequest,
) => billingRequest<DocumentLinkStopResponse>(context, 'documents/stop', request);

/** Sends a bill or receipt to the patient by SMS and/or email; each send then appears as a synced patient message. */
export const sendToPatient = (context: AuthorizationContext, request: SendToPatientRequest) =>
  billingRequest<SendToPatientResponse>(context, 'documents/send', request);
