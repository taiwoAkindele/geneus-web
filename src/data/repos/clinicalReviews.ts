import { parseDocument, workforceEnforcementActive, clinicalActivityIssues, clinicalEventActions, encounterClinicalActions, staffPermissions, withReviewerAuthority, type AnyDocument, type AuthoritySnapshot, type AuthorizationContext, type EncounterEntry, type SyncRejection } from '@shared';
import { consumeHistoricalPermit, reviewHistoricalCare, reviewHistoricalDraft } from '@/lib/api/workforce';
import { getFacility } from './facility';
import { assertAllowed } from '@/auth/authorization';
import { getDatabase } from '../database';
import { CLINICAL_REVIEWS_TABLE } from '../tables';
import { envelope, findRecord, insertRecord, insertRecords, newId, type NewRecord } from '../db';
import { ClinicalReviewRequired, clinicalPayloadHash, prepareClinical } from '../workforceClinical';
import { loadWorkforce, ownProof } from './workforce';
export type ClinicalReviewBundle = {
  id: string;
  semanticKey: string;
  sourceId: string;
  staffId: string;
  records: NewRecord[];
  proof: AuthoritySnapshot;
};
const sourceOf = (records: readonly NewRecord[]) => records.map((r) => r.record as AnyDocument).find((r) => r.type === 'encounter_entry' || r.type === 'clinical_event');
/** Normalize generated cross-references only, preserving all literal clinical content. */
const semantics = (records: readonly NewRecord[]) => {
  const ids = new Map(records.map((r, i) => [(r.record as AnyDocument).id, `new-record-${i}`]));
  const normalize = (value: unknown, depth: number, key = ''): unknown => {
    if (typeof value === 'string')
      return ['id', 'encounterId', 'appointmentId', 'recordId'].includes(key) ? ids.get(value) || value : value;
    if (Array.isArray(value))
      return value.map((v) => normalize(v, depth + 1, key === 'chargeIds' ? 'id' : key));
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).filter(([k]) => !(depth === 1 && (['createdOn', 'updatedOn'].includes(k) || (k === 'openedOn' && (value as {
        type?: string;
      }).type === 'encounter')))).map(([k, v]) => [k, normalize(v, depth + 1, k)]));
    return value;
  };
  return records.map((r) => ({ type: r.type, permission: r.permission, record: normalize(r.record, 1) }));
};
export const listClinicalReviews = async (context: AuthorizationContext): Promise<ClinicalReviewBundle[]> => {
  assertAllowed(context, 'encounter:record');
  const rows = await getDatabase().getAll<{
    data: string;
  }>(`SELECT data FROM ${CLINICAL_REVIEWS_TABLE} WHERE facilityId = ?`, [context.facilityId]);
  return rows.map((r) => JSON.parse(r.data) as ClinicalReviewBundle);
};
export const prepareClinicalBundle = async (records: readonly NewRecord[], context: AuthorizationContext): Promise<{
  records: NewRecord[];
  reviewId?: string;
}> => {
  const source = sourceOf(records);
  if (!source)
    return { records: [...records] };
  if (records.filter((r) => ['encounter_entry', 'clinical_event'].includes(r.type)).length === 1 && await consumeHistoricalPermit(context, source))
    return { records: [...records] };
  const enforcing=workforceEnforcementActive((await getFacility())?.workforcePolicy,Date.now());
  if (!enforcing&&!await getDatabase().getOptional(`SELECT id FROM ${CLINICAL_REVIEWS_TABLE} WHERE facilityId = ? AND staffId = ? LIMIT 1`,[context.facilityId,context.userId]))
    return { records: [...records] };
  const semanticKey = await clinicalPayloadHash({ actor: context.userId, records: semantics(records) });
  const row = await getDatabase().getOptional<{
    data: string;
  }>(`SELECT data FROM ${CLINICAL_REVIEWS_TABLE} WHERE id = ?`, [JSON.stringify([context.facilityId, context.deviceId, context.userId, semanticKey])]);
  const captured = row ? JSON.parse(row.data) as ClinicalReviewBundle : undefined;
  if(!enforcing){
    if(captured)throw new ClinicalReviewRequired(sourceOf(captured.records)!,captured.proof,true);
    return{records:[...records]};
  }
  const prepared: NewRecord[] = [], required: ClinicalReviewRequired[] = [];
  for (const record of captured?.records || records) {
    try {
      prepared.push({ ...record, record: await prepareClinical(record.record, context, captured?.proof) });
    }
    catch (cause) {
      if (cause instanceof ClinicalReviewRequired) {
        required.push(cause);
        prepared.push({ ...record, record: cause.record });
      }
      else
        throw cause;
    }
  }
  if (required.length) {
    const candidate = required[0], id = JSON.stringify([context.facilityId, context.deviceId, context.userId, semanticKey]);
    const bundle: ClinicalReviewBundle = { id, semanticKey, sourceId: candidate.record.id, staffId: context.userId, records: prepared, proof: candidate.proof };
    await getDatabase().execute(`INSERT OR REPLACE INTO ${CLINICAL_REVIEWS_TABLE}(id,facilityId,staffId,semanticKey,data) VALUES(?,?,?,?,?)`, [id, context.facilityId, context.userId, semanticKey, JSON.stringify(bundle)]);
    throw candidate;
  }
  return { records: prepared, reviewId: captured?.id };
};
export const clearClinicalReview = async (id: string) => getDatabase().execute(`DELETE FROM ${CLINICAL_REVIEWS_TABLE} WHERE id = ?`, [id]);
export const acknowledgeClinicalReview = async (bundle: ClinicalReviewBundle, context: AuthorizationContext, kind: 'supervisor' | 'checker'): Promise<void> => {
  assertAllowed(context, 'encounter:record');
  const data = await loadWorkforce(), worker = data.staff.find((s) => s.staffId === context.userId), proof = await ownProof(context, data);
  const candidate = sourceOf(bundle.records);
  if (!candidate || !worker || !proof || candidate.createdBy === context.userId)
    throw new Error('A different independently qualified staff member must acknowledge this source');
  const parsed = parseDocument(candidate);
  if (!parsed.success)
    throw new Error('The original review draft is no longer valid');
  if (candidate.type !== 'encounter_entry' && candidate.type !== 'clinical_event')
    throw new Error('Select a clinical source');
  const offeringId = candidate.actorContext?.offeringId;
  if (!offeringId)
    throw new Error('The source service is missing');
  const original = candidate.type === 'encounter_entry' && candidate.amends ? await findRecord<EncounterEntry>('encounter_entry', candidate.amends) : undefined;
  const actions = candidate.type === 'encounter_entry' ? encounterClinicalActions(candidate, original) : clinicalEventActions(candidate);
  const digest = await clinicalPayloadHash(parsed.data), at = new Date().toISOString(), audits: NewRecord[] = [];
  for (const action of actions) {
    const required = kind === 'checker' && ['record_result', 'perform_test'].includes(action) ? 'verify_result' : action;
    if (clinicalActivityIssues(worker, { ...context, permissions: staffPermissions(worker) }, proof, { action: required, offeringId }, Date.now()).length)
      continue;
    audits.push({ type: 'audit_event', permission: 'encounter:record', record: { ...envelope(context, at), id: newId('audit_event'), type: 'audit_event', actorStaffId: context.userId, action: 'update', entityType: candidate.type, entityId: candidate.id, occurredOn: at, metadata: { kind: 'workforce_attestation', recordId: candidate.id, payloadHash: digest, offeringId, action, attestationKind: kind, authoritySnapshotId: proof.snapshot.id } } });
  }
  if (!audits.length)
    throw new Error('You do not have independent accepted scope for any activity in this request');
  await insertRecords(context, audits);
};
export const resubmitHistoricalReview = async (rejection: SyncRejection, reason: string, context: AuthorizationContext): Promise<void> => {
  const parsed = parseDocument(rejection.refusedRecord);
  if (!parsed.success || !['encounter_entry', 'clinical_event'].includes(parsed.data.type) || parsed.data.facilityId !== context.facilityId)
    throw new Error('The original clinical source is not available for exact resubmission');
  const data = await loadWorkforce(), worker = data.staff.find((s) => s.staffId === context.userId);
  if (!worker)
    throw new Error('Your active staff identity is required');
  const trusted = withReviewerAuthority(context, worker, await ownProof(context, data), Date.now());
  assertAllowed(trusted, 'clinical_capability:review');
  await reviewHistoricalCare(context, rejection.id, reason, parsed.data);
  await insertRecord(trusted, 'clinical_capability:review', parsed.data.type, parsed.data, { replaceSame: true });
};
/** A retained unsigned draft can receive independent review before its first upload. */
export const submitReviewedClinicalDraft = async (bundle: ClinicalReviewBundle, reason: string, context: AuthorizationContext): Promise<void> => {
  const source = sourceOf(bundle.records);
  if (!source)
    throw new Error('The original clinical source is missing');
  const data = await loadWorkforce(), worker = data.staff.find((s) => s.staffId === context.userId);
  if (!worker)
    throw new Error('Active reviewer identity required');
  const trusted = withReviewerAuthority(context, worker, await ownProof(context, data), Date.now());
  assertAllowed(trusted, 'clinical_capability:review');
  await reviewHistoricalDraft(context, source, reason);
  const records = bundle.records.map((item) => item.type === source.type ? { ...item, permission: 'clinical_capability:review' as const } : { ...item, record: { ...(item.record as AnyDocument), ...envelope(context) } });
  await insertRecords(trusted, records);
  await clearClinicalReview(bundle.id);
};
