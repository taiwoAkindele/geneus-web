import type { AllocationSplit, AuthorizationContext, ImportKind, ImportTemplate, ImportTemplateSave, InsuranceDocument, InsuranceDocumentUpload, InsuranceSetupStatus, InsuranceState, Payer, PayerContractTerms, PayerContractVersion, Refund, StoredSubmissionProfile, SubmissionProfile, TariffImport, TariffImportResult, UnsupportedTerm } from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { ApiError, binaryRequest, workforceRequest } from './client';
import { expirePrivateWorkforce, verifiedToken } from './workforce';

/**
 * Online insurance and refund actions. Each needs the staff member's verified
 * email-code session (see StaffVerification): one code covers every action for
 * fifteen minutes. A refusal saying the session lapsed clears it here, so the
 * screen asks for a fresh code instead of failing the same way again.
 */
export class VerificationRequired extends Error {
  constructor() { super('Verify your staff email code to continue'); this.name = 'VerificationRequired'; }
}

const call = async <T>(context: AuthorizationContext, path: string, body: unknown): Promise<T> => {
  const device = getDeviceCredential();
  if (!device) throw new Error('This device is not enrolled');
  const token = verifiedToken(context);
  if (!token) throw new VerificationRequired();
  try {
    return await workforceRequest<T>(path, device.credential, token, body, 'POST');
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'private_verification_required') { expirePrivateWorkforce(); throw new VerificationRequired(); }
    throw cause;
  }
};

const key = () => crypto.randomUUID();

export type DeviceBlocker = { deviceId: string; reasons: string[]; pendingMutationCount?: number; lastReportedOn?: string; revokedOn?: string };
export type ConfirmOutcome = { chargeId: string; outcome: 'confirmed'; allocationId: string; state: string; patientShareMinor: number } | { chargeId: string; outcome: 'skipped'; reason: string };
export type PreviewItem = {
  chargeId: string; patientId: string; state: string; reason?: string; detail?: string;
  patientResponsibilityMinor: number; undeterminedMinor: number; balanceMinor: number; routine: boolean; split?: AllocationSplit;
};

export const savePayer = (context: AuthorizationContext, payer: { id?: string; name: string; kind: Payer['kind']; code: string; active: boolean }) =>
  call<Payer>(context, '/insurance/payers/save', payer);
export const listContracts = (context: AuthorizationContext) => call<{ versions: PayerContractVersion[] }>(context, '/insurance/contracts/list', {});
/** For staff who activate or end contracts without reading their prices. */
export type ContractSummary = Pick<PayerContractVersion, 'id' | 'contractId' | 'version' | 'status' | 'endedOn' | 'endReason' | 'activatedOn'> & { payerId: string; effectiveFrom: string; effectiveTo?: string };
export const listContractSummaries = (context: AuthorizationContext) => call<{ versions: ContractSummary[] }>(context, '/insurance/contracts/summaries', {});
export const saveContractDraft = (context: AuthorizationContext, terms: PayerContractTerms, expectedRevision?: number) =>
  call<{ version: PayerContractVersion; unsupported: UnsupportedTerm[] }>(context, '/insurance/contracts/draft', { terms, ...(expectedRevision ? { expectedRevision } : {}) });
export const activationReadiness = (context: AuthorizationContext) => call<{ devices: DeviceBlocker[] }>(context, '/insurance/contracts/readiness', {});
export const activateContract = (context: AuthorizationContext, input: { contractVersionId: string; acknowledgeUnsupported: boolean; acceptRevokedDevices: string[] }) =>
  call<{ contractVersionId: string; scheduleIds: string[]; unsupported: UnsupportedTerm[] }>(context, '/insurance/contracts/activate', { ...input, requestKey: key() });
export const endContract = (context: AuthorizationContext, input: { contractVersionId: string; endsOn: string; reason: string }) =>
  call<{ contractVersionId: string; endsOn: string }>(context, '/insurance/contracts/end', { ...input, requestKey: key() });
export const previewAllocations = (context: AuthorizationContext, chargeIds: string[]) => call<{ items: PreviewItem[] }>(context, '/insurance/allocations/preview', { chargeIds });
export const confirmAllocations = (context: AuthorizationContext, input: { chargeIds: string[]; basis: 'visit' | 'routine_bulk' | 'exception'; decision?: 'apply_cover' | 'self_pay'; reason?: string }) =>
  call<{ outcomes: ConfirmOutcome[] }>(context, '/insurance/allocations/confirm', { ...input, requestKey: key() });
export const recordRefund = (context: AuthorizationContext, input: { id: string; patientId: string; method: Refund['method']; currency: string; allocations: { chargeId: string; amountMinor: number }[]; reason: string; reference?: string }) =>
  call<Refund>(context, '/billing/refunds', input);

/** Plain-language reasons for confirmation outcomes the officer sees. */
export const SKIP_REASONS: Record<string, string> = {
  already_confirmed: 'Already confirmed', not_routine: 'Needs individual review', schedule_mismatch: 'Cover data changed — refresh and review',
  contract_unavailable: 'Contract version unavailable', reason_required: 'Give a reason', patient_liability_not_permitted: 'The contract does not allow billing the patient',
  choose_cover_first: 'Choose which cover applies first', self_pay_prohibited_by_payer: 'The contract prohibits paying without insurance', not_found: 'Charge not found',
  timezone_required: "Record the hospital's time zone first",
  outside_billing_period: 'Raised before insurance billing started, or after it stopped: billed as recorded',
};

/* ---------------- Setup, documents and submission settings (Milestone 1) ---------------- */

export const insuranceSetupStatus = (context: AuthorizationContext) =>
  call<InsuranceSetupStatus>(context, context.permissions.includes('insurance_contract:activate') ? '/insurance/setup/status' : '/insurance/setup/status/officer', {});
/** A hospital administrator enters or leaves setup. Billing is only ever activated by Geneus after readiness. */
export const setInsuranceSetup = (context: AuthorizationContext, state: 'off' | 'setup') => call<{ state: InsuranceState }>(context, '/insurance/setup', { state });
export const listInsuranceDocuments = (context: AuthorizationContext, payerId?: string) =>
  call<{ documents: InsuranceDocument[] }>(context, '/insurance/documents/list', payerId ? { payerId } : {});
export const verifyInsuranceDocument = (context: AuthorizationContext, id: string, verification: 'verified' | 'rejected', note?: string) =>
  call<InsuranceDocument>(context, `/insurance/documents/${encodeURIComponent(id)}/verify`, { verification, ...(note?.trim() ? { note: note.trim() } : {}) });
export const listSubmissionProfiles = (context: AuthorizationContext) => call<{ profiles: StoredSubmissionProfile[] }>(context, '/insurance/submission/list', {});
export const saveSubmissionProfile = (context: AuthorizationContext, payerId: string, profile: SubmissionProfile, expectedRevision?: number) =>
  call<{ payerId: string; profile: SubmissionProfile; revision: number }>(context, '/insurance/submission/save', { payerId, profile, ...(expectedRevision ? { expectedRevision } : {}) });

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Uploads a PDF or image as the request body; the server sniffs its content and checks the checksum. */
export const uploadInsuranceDocument = async (context: AuthorizationContext, file: File, meta: InsuranceDocumentUpload): Promise<InsuranceDocument> => {
  if (file.size > DOCUMENT_MAX_BYTES) throw new Error('Choose a PDF or image up to 10 MB');
  const device = getDeviceCredential(); if (!device) throw new Error('This device is not enrolled');
  const token = verifiedToken(context); if (!token) throw new VerificationRequired();
  const bytes = await file.arrayBuffer();
  try {
    const response = await binaryRequest('/insurance/documents', { method: 'POST', cache: 'no-store', body: bytes, headers: {
      authorization: `Bearer ${device.credential}`, 'x-workforce-access': token, 'content-type': 'application/octet-stream',
      'x-file-sha256': hex(await crypto.subtle.digest('SHA-256', bytes)), 'x-document-meta': encodeURIComponent(JSON.stringify(meta)),
    } });
    return await response.json() as InsuranceDocument;
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'private_verification_required') { expirePrivateWorkforce(); throw new VerificationRequired(); }
    throw cause;
  }
};

/** Downloads a stored document to the user's device; the server audits every download. */
export const downloadInsuranceDocument = async (context: AuthorizationContext, document_: InsuranceDocument) => {
  const device = getDeviceCredential(); if (!device) throw new Error('This device is not enrolled');
  const token = verifiedToken(context); if (!token) throw new VerificationRequired();
  const response = await binaryRequest(`/insurance/documents/${encodeURIComponent(document_.id)}/file`, { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${device.credential}`, 'x-workforce-access': token } });
  const url = URL.createObjectURL(await response.blob());
  try { const a = document.createElement('a'); a.href = url; a.download = document_.fileName; a.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
};

/* ---------------- Spreadsheet import (Milestone 2) ---------------- */

export const listImportTemplates = (context: AuthorizationContext, kind: ImportKind) => call<{ templates: ImportTemplate[] }>(context, '/insurance/import-templates/list', { kind });
export const saveImportTemplate = (context: AuthorizationContext, template: ImportTemplateSave) => call<ImportTemplate>(context, '/insurance/import-templates/save', template);
/** Applies confirmed rows to the draft. The request key is kept by the caller so a retry after a lost reply replays instead of applying twice. */
export const importTariff = (context: AuthorizationContext, input: TariffImport) => call<TariffImportResult>(context, '/insurance/contracts/import-tariff', input);
