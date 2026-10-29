import { FACILITY_DOCUMENT_POLICY, FACILITY_DOCUMENT_TYPES, parseDocument, currentFacilityRevisions, facilityReferenceIssues, facilityHeadIssues, unitHierarchyIssues, hierarchyIssues, billingOrganizationIssues, facilityRetirementImpact, sessionConflictIssues, sessionRosterIssues, sessionBookingIssues, sessionEventIssues, sessionEventHeadIssues, workOwnershipIssues, workOwnershipHeadIssues, workOwnershipReferenceIssues, reviewerDecisionIssues, withReviewerAuthority, clinicalActivityIssues, sessionClinicalCoverageIssues, effectiveFacilityRevisions, appointmentAllocationIssues, assignmentEligibilityIssues, staffPermissions, reservationMatchesAppointment, type AnyDocument, type AuthorizationContext, type FacilityRecords, type Staff, type Unit, type Location, type ServiceDefinition, type ServiceOffering, type PractitionerProfile, type StaffAssignment, type ServiceSession, type SessionEvent, type WorkOwnershipEvent, type AuthoritySnapshot, type AppointmentReservation, type Appointment, type Handoff, type RosterShift, type BillingDepartment, type Permission, type CapabilityDecision, type ReviewerDelegation, } from '@shared';
import { assertAllowed, freshAuthorization } from '@/auth/authorization';
import { allOfType, allWhere, envelope, findRecord, insertRecord, newId, updateRecord } from '../db';
import { getDatabase } from '../database';
import { getFacility } from './facility';
import { acceptedAuthority } from '../workforceAuthority';
import { privateCredentials } from '@/lib/api/workforce';
import { listWorkforceReceipts } from './workforceReceipts';
import { WORKFORCE_RECEIPTS_TABLE } from '../tables';
export const pendingWorkforceIds = async (): Promise<Set<string>> => {
  const rows = await getDatabase().getAll<{
    id: string;
  }>("SELECT json_extract(data, '$.id') AS id FROM ps_crud");
  return new Set(rows.map((row) => row.id));
};
export const loadWorkforce = async () => {
  const [units, locations, definitions, offerings, staff, profiles, assignments, sessions, events, ownership, snapshots, reservations, appointments, handoffs, roster, departments, facility, pending, rejections] = await Promise.all([
    allOfType<Unit>('unit'), allOfType<Location>('location'), allOfType<ServiceDefinition>('service_definition'), allOfType<ServiceOffering>('service_offering'),
    allOfType<Staff>('staff'), allOfType<PractitionerProfile>('practitioner_profile'), allOfType<StaffAssignment>('staff_assignment'), allOfType<ServiceSession>('service_session'),
    allOfType<SessionEvent>('session_event'), allOfType<WorkOwnershipEvent>('work_ownership_event'), allOfType<AuthoritySnapshot>('authority_snapshot'), allOfType<AppointmentReservation>('appointment_reservation'),
    allOfType<Appointment>('appointment'), allOfType<Handoff>('handoff'), allOfType<RosterShift>('roster_shift'), allOfType<BillingDepartment>('billing_department'), getFacility(), pendingWorkforceIds(), allOfType('sync_rejection'),
  ]);
  return { units, locations, definitions, offerings, staff, profiles, assignments, sessions, events, ownership, snapshots, reservations, appointments, handoffs, roster, departments, facility, pending, rejections, receipts: await listWorkforceReceipts(), credentials: [] };
};
export type WorkforceData = Awaited<ReturnType<typeof loadWorkforce>>;
export const failIssues = (issues: readonly string[]): void => {
  if (issues.length)
    throw new Error([...new Set(issues)].join('. '));
};
export const eventHeads = <T extends {
  id: string;
  previousId?: string;
}>(items: readonly T[]): T[] => items.filter((item) => !items.some((next) => next.previousId === item.id));
export const ownProof = async (context: AuthorizationContext, data: Pick<WorkforceData, 'snapshots'>) => acceptedAuthority(data.snapshots.filter((s) => s.staffId === context.userId && s.facilityId === context.facilityId).sort((a, b) => b.revision - a.revision)[0]);
/** Care signing does not scan appointment, handoff or audit history. */
export const loadCareContext = async () => {
  const [offerings, staff, snapshots, facility] = await Promise.all([allOfType<ServiceOffering>('service_offering'), allOfType<Staff>('staff'), allOfType<AuthoritySnapshot>('authority_snapshot'), getFacility()]);
  return { offerings, staff, snapshots, facility };
};
export const clinicalAssignments = async(staffId:string):Promise<StaffAssignment[]>=>{
  const records=await allWhere<StaffAssignment>('staff_assignment','staffId',staffId),unaccepted=new Set<string>();
  for(let offset=0;offset<records.length;offset+=500){
    const ids=records.slice(offset,offset+500).map((r)=>r.id),slots=ids.map(()=>'?').join(',');
    const [pending,refused]=await Promise.all([
      getDatabase().getAll<{id:string}>(`SELECT json_extract(data,'$.id') AS id FROM ps_crud WHERE json_extract(data,'$.id') IN (${slots})`,ids),
      getDatabase().getAll<{id:string}>(`SELECT id FROM ${WORKFORCE_RECEIPTS_TABLE} WHERE outcome='rejected' AND id IN (${slots})`,ids),
    ]);
    for(const row of [...pending,...refused])unaccepted.add(row.id);
  }
  return effectiveFacilityRevisions(records.filter((r)=>!unaccepted.has(r.id)),Date.now());
};
export const clinicalWitnesses = (recordId: string) => allWhere<import('@shared').AuditEvent>('audit_event', 'entityId', recordId);
/** Shared invariants run against the local replica; the server repeats them under its locks. */
export const validateWorkforce = async (record: AnyDocument, context: AuthorizationContext, current?: AnyDocument): Promise<AuthorizationContext> => {
  context = freshAuthorization(context);
  if (record.facilityId !== context.facilityId || (!current && record.createdBy !== context.userId))
    throw new Error('This record must belong to the signed-in person and facility');
  const data = await loadWorkforce(), now = Date.now();
  if (record.type === 'capability_decision')
    data.credentials = privateCredentials(context) as never[];
  const worker = data.staff.find((s) => s.staffId === context.userId && s.active);
  if (!worker || worker.permission !== 'read_write')
    throw new Error('An active writable staff account is required');
  let trusted = context;
  if (record.type === 'credential' && record.verification !== 'unverified')
    trusted = withReviewerAuthority(context, worker, await ownProof(context, data), now);
  if (record.type === 'capability_decision' || record.type === 'reviewer_delegation') {
    const proof = await ownProof(context, data);
    failIssues(reviewerDecisionIssues(worker, context, proof, record, now));
    trusted = withReviewerAuthority(context, worker, proof, now);
  }
  const policy = FACILITY_DOCUMENT_TYPES.includes(record.type as never) ? FACILITY_DOCUMENT_POLICY[record.type as keyof typeof FACILITY_DOCUMENT_POLICY] : undefined;
  if (policy?.writer === 'server' || ('externalReviewerId' in record && record.externalReviewerId))
    throw new Error('This record can only be established by authorized server governance');
  if (record.type === 'credential' && record.verification !== 'unverified')
    assertAllowed(trusted, 'clinical_capability:review');
  assertAllowed(trusted, record.type === 'unit' ? 'unit:manage' : record.type === 'billing_department' ? 'fee_item:manage' : (policy && 'permission' in policy ? policy.permission : 'unit:manage'));
  if (record.type === 'unit')
    failIssues(unitHierarchyIssues(record, data.units));
  else if (record.type === 'billing_department')
    failIssues(billingOrganizationIssues(record, data.units));
  else if (policy)
    failIssues(facilityReferenceIssues(record as never, data));
  if (record.type === 'location')
    failIssues(hierarchyIssues(record, data.locations));
  if (record.type === 'practitioner_profile' && current?.type === 'practitioner_profile' && record.staffId !== current.staffId)
    throw new Error('A professional profile belongs to its original staff identity. Update that person without moving their history');
  if (policy && ['versioned', 'append_only'].includes(policy.change)) {
    const history = await allOfType(record.type);
    if ('version' in record)
      failIssues(facilityHeadIssues(record as never, currentFacilityRevisions(history as never)));
  }
  if (record.type === 'staff_assignment' && record.status === 'active' && record.duty !== 'support') {
    const person = data.staff.find((s) => s.staffId === record.staffId)!;
    const proof = await acceptedAuthority(data.snapshots.find((s) => s.staffId === person.staffId));
    const personContext = { ...context, userId: person.staffId, role: person.role, permissions: staffPermissions(person) };
    const actions = record.requiredActions.length ? record.requiredActions : data.offerings.find((o) => o.id === record.offeringId)?.requiredActions || [];
    failIssues(assignmentEligibilityIssues(record, person, personContext, proof, { startsAt: record.startsAt, endsAt: record.endsAt || new Date(Math.max(now, Date.parse(record.startsAt)) + 1).toISOString() }, actions, now));
    if (record.supervisorId) {
      const supervisor = data.staff.find((s) => s.staffId === record.supervisorId);
      if (!supervisor)
        throw new Error('Choose an active qualified supervisor');
      const supervisorProof = await acceptedAuthority(data.snapshots.find((s) => s.staffId === supervisor.staffId));
      for (const action of actions)
        failIssues(clinicalActivityIssues(supervisor, { ...context, userId: supervisor.staffId, role: supervisor.role, permissions: staffPermissions(supervisor) }, supervisorProof, { action, offeringId: record.offeringId }, now));
    }
  }
  if (record.type === 'service_session') {
    failIssues(sessionConflictIssues(record, data.sessions, data.locations, data.appointments));
    failIssues(sessionRosterIssues(record, data.roster));
    failIssues(sessionBookingIssues(record, data.appointments, data.locations, now));
    if (record.status === 'published') {
      const offering = data.offerings.find((o) => o.id === record.offeringId)!;
      const participants = await Promise.all(record.participants.map(async (p) => {
        const staff = data.staff.find((s) => s.staffId === p.staffId)!;
        const assignment = effectiveFacilityRevisions(data.assignments, Date.parse(record.startsAt)).find((a) => a.assignmentId === p.assignmentId && a.staffId === p.staffId)!;
        return { staff, assignment, proof: await acceptedAuthority(data.snapshots.find((s) => s.staffId === p.staffId)), context: { ...context, userId: p.staffId, role: staff.role, permissions: (await import('@shared')).staffPermissions(staff) } };
      }));
      failIssues(sessionClinicalCoverageIssues(offering, record, participants, now));
    }
  }
  if (record.type === 'session_event') {
    const history = data.events.filter((e) => e.offeringId === record.offeringId && e.sessionId === record.sessionId), heads = eventHeads(history);
    failIssues(sessionEventHeadIssues(record, heads));
    failIssues(sessionEventIssues(record, history.find((e) => e.id === record.previousId)));
  }
  if (record.type === 'work_ownership_event') {
    const source = data.handoffs.find((h) => h.id === record.sourceId)!;
    failIssues(workOwnershipHeadIssues(record, eventHeads(data.ownership)));
    failIssues(workOwnershipIssues(record, source, data.ownership.find((e) => e.id === record.previousId), context.permissions.includes('work_ownership:manage')));
    failIssues(workOwnershipReferenceIssues(record, source, data, now));
  }
  if (current && ((record.type === 'unit' || record.type === 'location') && !record.active || record.type === 'service_offering' && record.configuration === 'retired')) {
    const impact = facilityRetirementImpact(record as never, { ...data, ownershipHeads: eventHeads(data.ownership).filter((e) => data.handoffs.some((h) => h.id === e.sourceId && h.status !== 'done')) }, now);
    failIssues(impact.map((item) => item.reason));
  }
  return trusted;
};
/** The editor passes a canonical shape, never SQL or server-owned provenance. */
export const saveWorkforce = async (type: AnyDocument['type'], fields: Record<string, unknown>, context: AuthorizationContext, previous?: AnyDocument, operationId?: string): Promise<AnyDocument> => {
  fields={...fields};
  for(const key of ['id','type','facilityId','createdBy','createdOn','deviceId','schemaVersion','updatedBy','updatedOn','revision','version','previousId'])delete fields[key];
  const policy = type === 'unit' || type === 'billing_department' ? { change: 'revision', permission: type === 'unit' ? 'unit:manage' : 'fee_item:manage' } : FACILITY_DOCUMENT_POLICY[type as keyof typeof FACILITY_DOCUMENT_POLICY];
  if (!policy || !('permission' in policy))
    throw new Error('This record is managed by the server');
  if (previous && (await pendingWorkforceIds()).has(previous.id))
    throw new Error('This proposal is still syncing. Wait for acceptance or resolve its refusal before editing it again');
  const configuration = policy.change === 'revision';
  const id = configuration && previous ? previous.id : operationId || newId(type);
  const versioned = policy.change === 'versioned';
  const streamKey = ({ credential: 'credentialId', capability_decision: 'capabilityId', reviewer_delegation: 'delegationId', staff_assignment: 'assignmentId', service_session: 'sessionId' } as Record<string, string>)[type];
  const record = parseDocument({
    ...(configuration && previous ? previous : envelope(context)), ...fields, id, type, schemaVersion: 4,
    ...(type === 'unit' ? { unitId: previous && previous.type === 'unit' ? previous.unitId : id } : {}),
    ...(configuration ? { revision: previous && 'revision' in previous ? (previous.revision as number ?? 1) + 1 : previous ? 2 : 1 } : {}),
    ...(versioned ? { [streamKey]: previous ? (previous as Record<string, unknown>)[streamKey] : id, version: previous && 'version' in previous ? Number(previous.version) + 1 : 1, previousId: previous?.id } : {}),
  });
  if (!record.success)
    throw new Error(record.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('. '));
  const trusted = await validateWorkforce(record.data, context, previous);
  if (configuration && previous)
    return updateRecord(trusted, policy.permission as Permission, type, previous.id, {
      ...fields, schemaVersion: 4, revision: (record.data as {
        revision: number;
      }).revision
    } as Partial<AnyDocument>);
  return insertRecord(trusted, policy.permission as Permission, type, record.data);
};
/** Stable occurrence IDs make interrupted finite-series saves resumable, not duplicate sessions. */
export const saveWeeklyOccurrence = async (fields: Record<string, unknown>, context: AuthorizationContext, seriesId: string, index: number): Promise<AnyDocument> => {
  const id = `service_session:${seriesId}:${index + 1}`, current = await findRecord<ServiceSession>('service_session', id);
  if (current) {
    const parsed = parseDocument({ ...current, ...fields, id, type: 'service_session' });
    const hash = (await import('../workforceClinical')).clinicalPayloadHash;
    if (!parsed.success || current.createdBy !== context.userId || await hash(parsed.data) !== await hash(current))
      throw new Error(`Occurrence ${index + 1} was already saved with different details. Review its existing coverage before continuing`);
    return current;
  }
  return saveWorkforce('service_session', fields, context, undefined, id);
};
export const validateAllocation = async (appointment: Appointment): Promise<void> => {
  if (appointment.allocation) {
    const data = await loadWorkforce();
    failIssues(appointmentAllocationIssues(appointment, data, data.appointments.filter((a) => a.id !== appointment.id && data.reservations.filter((r) => r.appointmentId === a.id).sort((x, y) => y.revision - x.revision).some((r, index) => index === 0 && reservationMatchesAppointment(r, a)))));
  }
};
export const saveIntake = (offeringId: string, sessionId: string | undefined, action: SessionEvent['action'], reason: string, context: AuthorizationContext, previous?: SessionEvent) => saveWorkforce('session_event', { offeringId, sessionId, action, reason: reason.trim() || undefined, observedOn: new Date().toISOString(), previousId: previous?.id }, context);
export const saveOwnership = (source: Handoff, offeringId: string, action: WorkOwnershipEvent['action'], reason: string, recipientStaffId: string | undefined, context: AuthorizationContext, previous?: WorkOwnershipEvent) => saveWorkforce('work_ownership_event', {
  sourceType: 'handoff', sourceId: source.id, patientId: source.patientId, offeringId, action, reason: reason.trim() || undefined, previousId: previous?.id,
  ownerStaffId: action === 'claim' || action === 'accept_transfer' ? context.userId : action === 'release' ? undefined : previous?.ownerStaffId, recipientStaffId: action === 'offer_transfer' ? recipientStaffId : undefined
}, context);
export type { FacilityRecords, CapabilityDecision, ReviewerDelegation };
