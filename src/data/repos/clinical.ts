import { CLINICAL_VALUES, currentClinicalEvents, canReadPatientChart, type AuthorizationContext, type ClinicalEvent, type ClinicalKind, type Encounter } from '@shared';
import { assertAllowed } from '@/auth/authorization';
import { allOfType, allWhere, envelope, findRecord, insertRecord, newId } from '../db';
import { patientIdentityIds } from './patientIdentity';
import { encountersForPatient, entriesForEncounter } from './encounters';
import { listStaff } from './staff';
import { getPatient } from './patients';
import { activeWorkspace } from '../facilityWorkspaces';

export const clinicalEventsForPatient = (patientId: string) => allWhere<ClinicalEvent>('clinical_event', 'patientId', patientId);
export const listAllergyEvents = () => allWhere<ClinicalEvent>('clinical_event', 'kind', 'allergy');
/** Callers must check medical-history access first; this reads every patient's clinical record. */
export const listClinicalEvents = () => allOfType<ClinicalEvent>('clinical_event');

export const patientClinicalRecord = async (patientId: string, context:AuthorizationContext) => {
  if(!canReadPatientChart(context))throw new Error('Permission to view medical history is required');
  const workspace=activeWorkspace();
  if(workspace&&(workspace.facilityId!==context.facilityId||workspace.deviceId!==context.deviceId))throw new Error('Open medical history in the current hospital workspace');
  const patient=await getPatient(patientId);
  if(patient&&patient.facilityId!==context.facilityId)throw new Error('Medical history belongs to another hospital');
  const ids = await patientIdentityIds(patientId);
  const [groups, encounterGroups, staff, patients] = await Promise.all([
    Promise.all(ids.map(clinicalEventsForPatient)), Promise.all(ids.map(encountersForPatient)), listStaff(), Promise.all(ids.map(getPatient)),
  ]);
  const events = groups.flat();
  const encounters = encounterGroups.flat().sort((a, b) => b.openedOn.localeCompare(a.openedOn));
  const entries = (await Promise.all(encounters.map((encounter) => entriesForEncounter(encounter.id)))).flat();
  return { events, current: currentClinicalEvents(events), encounters, entries, patients: patients.filter((patient) => patient !== undefined), staffNames: new Map(staff.map((member) => [member.staffId, member.fullName])) };
};
export type PatientClinicalRecord = Awaited<ReturnType<typeof patientClinicalRecord>>;

export const saveClinicalRecord = async (
  patientId: string, kind: ClinicalKind, values: Record<string, unknown>, context: AuthorizationContext,
  previous?: ClinicalEvent, encounterId?: string,
): Promise<ClinicalEvent> => {
  assertAllowed(context, 'encounter:record');
  const parsed = CLINICAL_VALUES[kind].safeParse(values);
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  if (previous && (previous.patientId !== patientId || previous.kind !== kind)) throw new Error('A revision must continue the original patient and record type');
  const stored = await clinicalEventsForPatient(patientId);
  if (previous && !currentClinicalEvents(stored).some((event) => event.id === previous.id)) throw new Error('This record changed. Close the form and review the current version');
  if (encounterId) {
    const encounter = await findRecord<Encounter>('encounter', encounterId);
    if (!encounter || encounter.patientId !== patientId || encounter.facilityId !== context.facilityId) throw new Error('The encounter must belong to this patient');
  }
  if (values.problemId && !stored.some((event) => event.recordId === values.problemId && event.kind === 'problem')) throw new Error('Choose a problem belonging to this patient');
  const id = newId('clinical_event');
  return insertRecord<ClinicalEvent>(context, 'encounter:record', 'clinical_event', {
    ...envelope(context), id, type: 'clinical_event', patientId, encounterId,
    kind, recordId: previous?.recordId ?? id, previousId: previous?.id, actorRole: context.role, values: parsed.data,
  });
};
