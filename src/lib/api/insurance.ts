import type { ClaimSettlement, DiagnosisCatalogueImport, DiagnosisCatalogueSummary, DisputeOpen, DisputeResolve, LiabilityChange, PayerDecisionInput, RemittanceInput, RemittanceMatch, RemittanceRow, WriteOffInput } from '@shared';
import type { AllocationSplit, AuthorizationContext, AuthorizationInput, ClaimAcknowledgementInput, ClaimAuthorization, ClaimIssue, ClaimState, ClaimSubmissionInput, ClaimView, ImportKind, ImportTemplate, ImportTemplateSave, InsuranceDocument, InsuranceDocumentUpload, InsuranceSetupStatus, InsuranceState, Payer, PayerContractTerms, PayerContractVersion, Refund, StoredSubmissionProfile, SubmissionProfile, TariffImport, TariffImportResult, UnsupportedTerm } from '@shared';
import { getDeviceCredential } from '@/data/deviceCredential';
import { ApiError, binaryRequest, staffRequest } from './client';
import { forgetStaffSession, staffSessionToken, touchStaffSession } from './staffSession';

/**
 * Online insurance and refund actions. Each needs the staff member's verified
 * email-code session (see StaffVerification): one code covers every action for
 * fifteen minutes. A refusal saying the session lapsed clears it here, so the
 * screen asks for a fresh code instead of failing the same way again.
 */
export class VerificationRequired extends Error {
  constructor() { super('Confirm your PIN to continue'); this.name = 'VerificationRequired'; }
}

const call = async <T>(context: AuthorizationContext, path: string, body: unknown): Promise<T> => {
  const device = getDeviceCredential();
  if (!device) throw new Error('This device is not enrolled');
  const token = staffSessionToken(context);
  if (!token) throw new VerificationRequired();
  try {
    const result = await staffRequest<T>(path, device.credential, token, body);
    touchStaffSession();
    return result;
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'staff_session_required') { forgetStaffSession(); throw new VerificationRequired(); }
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
export const confirmAllocations = (context: AuthorizationContext, input: { chargeIds: string[]; basis: 'visit' | 'routine_bulk' | 'exception'; decision?: 'apply_cover' | 'self_pay'; reason?: string; liability?: LiabilityChange }) =>
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
  ground_required: 'Choose the documented ground for making the patient liable', on_current_claim: 'It is on a current claim. Revise the claim first',
  missing_configuration_is_not_a_ground: 'Missing hospital configuration is not a reason to charge the patient. Complete the contract set-up',
  contract_does_not_allow_self_pay: 'The contract in force on the date of service does not allow members to pay without insurance',
  not_eligible_check_required: 'Name a recorded check that found the cover not eligible on the date of service',
  liability_approval_required: 'The payer is expected to pay this. Moving it to the patient needs someone allowed to approve liability changes',
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
  const token = staffSessionToken(context); if (!token) throw new VerificationRequired();
  const bytes = await file.arrayBuffer();
  try {
    const response = await binaryRequest('/insurance/documents', { method: 'POST', cache: 'no-store', body: bytes, headers: {
      authorization: `Bearer ${device.credential}`, 'x-staff-session': token, 'content-type': 'application/octet-stream',
      'x-file-sha256': hex(await crypto.subtle.digest('SHA-256', bytes)), 'x-document-meta': encodeURIComponent(JSON.stringify(meta)),
    } });
    return await response.json() as InsuranceDocument;
  } catch (cause) {
    if (cause instanceof ApiError && cause.code === 'staff_session_required') { forgetStaffSession(); throw new VerificationRequired(); }
    throw cause;
  }
};

/** Downloads a stored document to the user's device; the server audits every download. */
export const downloadInsuranceDocument = async (context: AuthorizationContext, document_: InsuranceDocument) => {
  const device = getDeviceCredential(); if (!device) throw new Error('This device is not enrolled');
  const token = staffSessionToken(context); if (!token) throw new VerificationRequired();
  const response = await binaryRequest(`/insurance/documents/${encodeURIComponent(document_.id)}/file`, { method: 'POST', cache: 'no-store', headers: { authorization: `Bearer ${device.credential}`, 'x-staff-session': token } });
  const url = URL.createObjectURL(await response.blob());
  try { const a = document.createElement('a'); a.href = url; a.download = document_.fileName; a.click(); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
};

/* ---------------- Spreadsheet import (Milestone 2) ---------------- */

export const listImportTemplates = (context: AuthorizationContext, kind: ImportKind) => call<{ templates: ImportTemplate[] }>(context, '/insurance/import-templates/list', { kind });
export const saveImportTemplate = (context: AuthorizationContext, template: ImportTemplateSave) => call<ImportTemplate>(context, '/insurance/import-templates/save', template);
/** Applies confirmed rows to the draft. The request key is kept by the caller so a retry after a lost reply replays instead of applying twice. */
export const importTariff = (context: AuthorizationContext, input: TariffImport) => call<TariffImportResult>(context, '/insurance/contracts/import-tariff', input);

/* ---------------- Claims (Milestone 3) ---------------- */

export type ClaimBatch = { id: string; payerId: string; reference: string; periodFrom: string; periodTo: string; claims: number; createdOn: string };
export type ClaimSubmission = { id: string; payerId: string; claimIds: string[]; channel: string; reference: string; submittedOn: string; submittedBy: string; evidenceDocumentId?: string; exportIds: string[]; resubmission: boolean; note?: string; acknowledgement?: { id: string; reference?: string; acknowledgedOn: string } };
export type ClaimExport = { exportId: string; draft: boolean; headers: string[]; rows: (string | number)[][]; payloadSha256: string; claims: { id: string; claimNumber: string; revision: number }[] };
export type ReadyOutcome = { claimId: string; outcome: 'ready' } | { claimId: string; outcome: 'skipped'; reason: string; issues?: ClaimIssue[] };

export const saveAuthorization = (context: AuthorizationContext, input: AuthorizationInput) => call<ClaimAuthorization>(context, '/insurance/authorizations/save', input);
export const listAuthorizations = (context: AuthorizationContext, patientId?: string) => call<{ authorizations: ClaimAuthorization[] }>(context, '/insurance/authorizations/list', patientId ? { patientId } : {});
export const generateClaims = (context: AuthorizationContext, filter: { payerId?: string; from?: string; to?: string } = {}) => call<{ created: number; extended: number; lines: number }>(context, '/insurance/claims/generate', filter);
export const listClaims = (context: AuthorizationContext, filter: { payerId?: string; state?: ClaimState; batchId?: string; claimIds?: string[]; includeSuperseded?: boolean } = {}) => call<{ claims: ClaimView[] }>(context, '/insurance/claims/list', filter);
export const markClaimsReady = (context: AuthorizationContext, claimIds: string[]) => call<{ outcomes: ReadyOutcome[] }>(context, '/insurance/claims/ready', { claimIds });
export const reviseClaim = (context: AuthorizationContext, claimId: string, reason: string) => call<{ claimId: string; revision: number; lines: number; dropped: number }>(context, `/insurance/claims/${encodeURIComponent(claimId)}/revise`, { reason, requestKey: key() });
export const setClaimAttachment = (context: AuthorizationContext, claimId: string, documentId: string, remove = false) => call<{ ok: true }>(context, `/insurance/claims/${encodeURIComponent(claimId)}/attachments`, { documentId, remove });
export const createClaimBatch = (context: AuthorizationContext, input: { payerId: string; periodFrom: string; periodTo: string; reference?: string }) => call<{ batchId: string; reference: string; claims: number }>(context, '/insurance/claims/batches/create', input);
export const listClaimBatches = (context: AuthorizationContext) => call<{ batches: ClaimBatch[] }>(context, '/insurance/claims/batches/list', {});
/** Rows to write or print. A draft export marks every row and changes no claim; a real one moves ready claims to exported. */
export const exportClaims = (context: AuthorizationContext, input: { claimIds?: string[]; batchId?: string; draft: boolean; format: 'csv' | 'xlsx' | 'pdf'; templateId?: string }) =>
  call<ClaimExport>(context, '/insurance/claims/export', { ...input, requestKey: key() });
export const submitClaims = (context: AuthorizationContext, input: Omit<ClaimSubmissionInput, 'requestKey'>) => call<{ submissionId: string; claims: number }>(context, '/insurance/claims/submit', { ...input, requestKey: key() });
export const acknowledgeClaims = (context: AuthorizationContext, input: Omit<ClaimAcknowledgementInput, 'requestKey'>) => call<{ acknowledgementId: string; claims: number }>(context, '/insurance/claims/acknowledge', { ...input, requestKey: key() });
export const listClaimSubmissions = (context: AuthorizationContext) => call<{ submissions: ClaimSubmission[] }>(context, '/insurance/claims/submissions/list', {});

export const CLAIM_ISSUE_LABELS: Record<ClaimIssue['code'], string> = {
  fulfillment_missing: 'Not shown as done', not_performed: 'Recorded as not done', authorization_missing: 'Authorization missing', authorization_pending: 'Authorization pending',
  authorization_denied: 'Authorization denied', authorization_emergency_followup: 'Emergency care: approval to follow', authorization_quantity_exceeded: 'More than authorized',
  referral_missing: 'Referral missing', diagnosis_missing: 'No diagnosis', diagnosis_code_missing: 'No diagnosis code',
  diagnosis_code_format: 'Invalid diagnosis code', diagnosis_code_not_in_catalogue: 'Code not in your list', diagnosis_catalogue_missing: 'No licensed code list',
  admission_date_missing: 'Admission date unknown', discharge_date_missing: 'Not yet discharged', enrollee_number_missing: 'No enrollee number',
  service_date_invalid: 'Invalid service date', amount_invalid: 'Invalid amount', allocation_superseded: 'Split corrected since', submission_method_missing: 'No submission method',
  payer_code_missing: 'No payer service code', attachment_missing: 'Attachment missing',
};

/** The administrator asks Geneus to switch insurance billing on; Geneus approves in its operator console. */
export const requestInsuranceActivation = (context: AuthorizationContext, note?: string) => call<InsuranceSetupStatus>(context, '/insurance/activation/request', note?.trim() ? { note: note.trim() } : {});
export const withdrawInsuranceActivation = (context: AuthorizationContext) => call<InsuranceSetupStatus>(context, '/insurance/activation/withdraw', {});

/* ---------------- Diagnosis catalogue (audit H1) ---------------- */

export const importDiagnosisCatalogue = (context: AuthorizationContext, input: DiagnosisCatalogueImport) =>
  call<{ importId: string; codeSystem: string; added: number; changed: number; removed: number; codes: number }>(context, '/insurance/diagnosis-catalogue/import', input);
export const listDiagnosisCatalogues = (context: AuthorizationContext) => call<{ catalogues: DiagnosisCatalogueSummary[] }>(context, '/insurance/diagnosis-catalogue/list', {});

/* ---------------- Payer decisions, remittances and settlement (Slice 4) ---------------- */

export type RemittanceView = {
  id: string; payerId: string; receivedOn: string; reference: string; amountMinor: number; currency: string; method: string; receivingAccount?: string;
  allocatedMinor: number; unallocatedMinor: number; reversed?: { reason: string; by: string; on: string };
  allocations: { claimId: string; claimNumber: string; revision: number; amountMinor: number }[]; recordedBy: string; recordedOn: string;
};
export type OutstandingClaim = Pick<ClaimView, 'id' | 'claimNumber' | 'revision' | 'payerId' | 'patientId' | 'patientName' | 'enrolleeNumber' | 'state' | 'serviceFrom' | 'serviceTo' | 'currency'> & { settlement: ClaimSettlement };
export type OutstandingTotals = Record<string, { expected: number; approved: number; deducted: number; paid: number; writtenOff: number; disputed: number; outstanding: number; payerOwes: number; overdue: number }>;
export type DisputeView = { id: string; claimId: string; claimNumber: string; revision: number; payerId: string; amountMinor: number; reason: string; payerReference?: string; openedBy: string; openedOn: string; resolution?: { outcome: string; note: string; by: string; on: string } };

export const recordPayerDecision = (context: AuthorizationContext, input: Omit<PayerDecisionInput, 'requestKey' | 'lines'> & { lines?: PayerDecisionInput['lines'] }) =>
  call<{ decisionId: string; claimId: string; decision: string; approvedMinor: number }>(context, '/insurance/claims/decisions/record', { ...input, requestKey: key() });
/** The caller keeps the request key for the whole entry, so a retry after a lost reply never records the payment twice. */
export const recordRemittance = (context: AuthorizationContext, input: Omit<RemittanceInput, 'allocations'> & { allocations?: RemittanceInput['allocations'] }) =>
  call<{ remittanceId: string; allocatedMinor: number; unallocatedMinor: number }>(context, '/insurance/remittances/record', input);
export const allocateRemittance = (context: AuthorizationContext, input: { remittanceId: string; allocations: { claimId: string; amountMinor: number }[] }) =>
  call<{ remittanceId: string; allocatedMinor: number; unallocatedMinor: number }>(context, '/insurance/remittances/allocate', { ...input, requestKey: key() });
export const reverseRemittance = (context: AuthorizationContext, remittanceId: string, reason: string) =>
  call<{ remittanceId: string }>(context, '/insurance/remittances/reverse', { remittanceId, reason, requestKey: key() });
export const listRemittances = (context: AuthorizationContext, payerId?: string) => call<{ remittances: RemittanceView[] }>(context, '/insurance/remittances/list', payerId ? { payerId } : {});
export const matchRemittance = (context: AuthorizationContext, payerId: string, rows: RemittanceRow[]) => call<{ matches: RemittanceMatch[] }>(context, '/insurance/remittances/match', { payerId, rows });
export const outstandingClaims = (context: AuthorizationContext, payerId?: string) => call<{ claims: OutstandingClaim[]; totals: OutstandingTotals }>(context, '/insurance/outstanding', payerId ? { payerId } : {});
export const openDispute = (context: AuthorizationContext, input: Omit<DisputeOpen, 'requestKey'>) => call<{ disputeId: string }>(context, '/insurance/disputes/open', { ...input, requestKey: key() });
export const resolveDispute = (context: AuthorizationContext, input: Omit<DisputeResolve, 'requestKey'>) => call<{ disputeId: string }>(context, '/insurance/disputes/resolve', { ...input, requestKey: key() });
export const listDisputes = (context: AuthorizationContext) => call<{ disputes: DisputeView[] }>(context, '/insurance/disputes/list', {});
export const writeOff = (context: AuthorizationContext, input: Omit<WriteOffInput, 'requestKey'>) => call<{ writeOffId: string }>(context, '/insurance/write-offs', { ...input, requestKey: key() });

export const SETTLEMENT_LABELS: Record<ClaimSettlement['status'], string> = {
  not_submitted: 'Not with the payer', awaiting_response: 'Awaiting payer', queried: 'Queried by payer', returned: 'Returned for correction', denied: 'Denied',
  approved_unpaid: 'Approved, unpaid', partially_paid: 'Partly paid', disputed: 'Disputed', settled: 'Settled',
};
export const DIAGNOSIS_VERIFICATION_LABELS: Record<string, string> = {
  catalogue_verified: 'verified in your licensed list', format_checked: 'format checked only', format_invalid: 'not a valid code', not_in_catalogue: 'not in your list', not_coded: 'written',
};
