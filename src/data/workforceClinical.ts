import { parseDocument, clinicalActivityIssues, clinicalEventActions, encounterClinicalActions, workforceEnforcementActive, scopeAllows, intervalContains, type AnyDocument, type AuthorizationContext, type ClinicalActorContext, type EncounterEntry, type AuthoritySnapshot } from '@shared';
import { acceptedAuthority } from './workforceAuthority';
import { freshAuthorization } from '@/auth/authorization';
import { secureGet, secureSet } from '@/lib/secureStorage';
import { findRecord } from './db';
import { getFacility } from './repos/facility';
import { loadCareContext, clinicalAssignments, clinicalWitnesses, ownProof, failIssues } from './repos/workforce';
const selectionKey = (context: AuthorizationContext) => `geneus.careService:${context.facilityId}:${context.deviceId}:${context.userId}`;
export const selectedCareService = (context: AuthorizationContext): string => JSON.parse(secureGet('geneus.workforce.selections') ?? '{}')[selectionKey(context)] ?? '';
export const selectCareService = (context: AuthorizationContext, id: string) => secureSet('geneus.workforce.selections', JSON.stringify({ ...JSON.parse(secureGet('geneus.workforce.selections') ?? '{}'), [selectionKey(context)]: id }));
const instantFields = new Set(['createdOn', 'updatedOn', 'issuedOn', 'expiresOn', 'startsAt', 'endsAt', 'checkedOn', 'occurredOn', 'effectiveOn']);
const canonical = (value: unknown, root = true): unknown => Array.isArray(value) ? value.map((v) => canonical(v, false)) : value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => [k, root && instantFields.has(k) && typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : canonical(v, false)])) : value;
export const clinicalPayloadHash = async (record: unknown): Promise<string> => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(canonical(record))))), (b) => b.toString(16).padStart(2, '0')).join('');
export class ClinicalReviewRequired extends Error {
  constructor(readonly record: AnyDocument, readonly proof: AuthoritySnapshot, historical = false) { super(historical ? 'This retained draft needs independent historical review. Its original author and time are preserved in Clinical reviews' : 'A qualified co-signature is needed. Your unsigned draft is saved in Clinical reviews; return to this form after acknowledgement'); }
}
/** Every clinical repository uses this boundary, including corrections and longitudinal notes. */
export const prepareClinical = async (input: unknown, context: AuthorizationContext, capturedProof?: AuthoritySnapshot): Promise<unknown> => {
  context = freshAuthorization(context);
  const parsed = parseDocument(input);
  if (!parsed.success)
    throw new Error(parsed.error.issues.map((i) => i.message).join('. '));
  const candidate = parsed.data;
  if (candidate.type !== 'encounter_entry' && candidate.type !== 'clinical_event')
    return input;
  const facility = await getFacility();
  if (!workforceEnforcementActive(facility?.workforcePolicy, Date.now()))
    return input;
  if (candidate.createdBy !== context.userId)
    throw new Error('Clinical authorship must match the signed-in person. Use independent historical review to resubmit an unchanged original author');
  const data = await loadCareContext(), worker = data.staff.find((s) => s.staffId === context.userId), proof = await ownProof(context, data);
  const enforced = workforceEnforcementActive(facility?.workforcePolicy, Date.now());
  if (!worker || !proof) {
    if (!enforced)
      return input;
    throw new Error('Connect to refresh your accepted clinical approval before signing. Your form remains available');
  }
  const original = candidate.type === 'encounter_entry' && candidate.amends ? await findRecord<EncounterEntry>('encounter_entry', candidate.amends) : undefined;
  const actions = candidate.type === 'encounter_entry' ? encounterClinicalActions(candidate, original) : clinicalEventActions(candidate);
  const eligible = data.offerings.filter((o) => o.configuration === 'active' && actions.every((action) => proof.snapshot.grants.some((g) => intervalContains(g, Date.now()) && scopeAllows(g.scope, action, o.id))));
  const offeringId = selectedCareService(context) || (eligible.length === 1 ? eligible[0].id : '');
  if (!offeringId) {
    if (!enforced)
      return input;
    throw new Error('Choose the service you are recording care for in Care service above');
  }
  const assignments = (await clinicalAssignments(context.userId)).filter((a) => a.offeringId === offeringId && a.status === 'active' && intervalContains(a, Date.now()));
  const historic = capturedProof ? await acceptedAuthority(capturedProof) : undefined;
  if (capturedProof && (!historic || capturedProof.staffId !== context.userId || capturedProof.facilityId !== context.facilityId))
    throw new Error('The original captured authority cannot be verified. Retain the draft for clinical review');
  const actorContext: ClinicalActorContext = capturedProof && candidate.actorContext ? candidate.actorContext : { offeringId, authoritySnapshotId: proof.snapshot.id, assignmentRevisionId: assignments.length === 1 ? assignments[0].id : undefined };
  if (actorContext.offeringId !== offeringId)
    throw new Error('This draft was captured for a different service. Choose its original service to continue');
  const record = { ...candidate, actorContext };
  if (capturedProof && Date.parse(capturedProof.expiresOn) <= Date.now())
    throw new ClinicalReviewRequired(record, capturedProof, true);
  const digest = await clinicalPayloadHash(record), audits = await clinicalWitnesses(record.id);
  let needsReview = false;
  for (const action of actions) {
    const qualified: string[] = [];
    for (const audit of audits) {
      if (audit.type !== 'audit_event' || audit.metadata?.kind !== 'workforce_attestation' || audit.metadata.recordId !== record.id || audit.metadata.payloadHash !== digest || audit.metadata.offeringId !== offeringId || audit.metadata.action !== action || audit.createdBy === context.userId)
        continue;
      const witness = data.staff.find((s) => s.staffId === audit.createdBy);
      if (!witness)
        continue;
      const witnessProof = await ownProof({ ...context, userId: witness.staffId }, data);
      const permission = (await import('@shared')).staffPermissions(witness);
      const required = audit.metadata.attestationKind === 'checker' && ['record_result', 'perform_test'].includes(action) ? 'verify_result' : action;
      if (!clinicalActivityIssues(witness, { ...context, userId: witness.staffId, role: witness.role, permissions: permission }, witnessProof, { action: required, offeringId }, Date.now()).length)
        qualified.push(witness.staffId);
    }
    const issues = clinicalActivityIssues(worker, context, proof, { action, offeringId, availableQualifiedActorIds: qualified }, Date.now());
    if (historic)
      issues.push(...clinicalActivityIssues(worker, { ...context, lastServerContactOn: capturedProof!.issuedOn }, historic, { action, offeringId, availableQualifiedActorIds: qualified }, Date.parse(record.createdOn)));
    const other = issues.filter((message) => !message.includes('Required independent supervisor/checker'));
    failIssues(other);
    if (issues.length)
      needsReview = true;
  }
  if (needsReview)
    throw new ClinicalReviewRequired(record, capturedProof || proof.snapshot);
  return record;
};
