import { careServiceOfferings, unitIsRoutable, type VisitType, type AuthorizationContext, type Location, type ServiceDefinition, type ServiceOffering, type Unit } from '@shared';
import { saveWorkforce, type WorkforceData } from '@/data/repos/workforce';

/**
 * Care services are the broad kinds of care a hospital provides (outpatient
 * consultation, antenatal care, inpatient care). Each is an ordinary
 * service_definition + service_offering pair, so appointments, staff
 * assignments and clinical authority treat it like any other offering.
 *
 * Lab tests are offerings too (each catalogue test has one, for ordering and
 * pricing), but they belong to the Lab catalogue, never to this list.
 */
export type CareCategory = ServiceDefinition['category'];
/** visitTypes: the visits it records (first is the usual one); none for care that is not a visit. */
export type CarePreset = { key: string; name: string; category: CareCategory; intakePolicy: ServiceOffering['intakePolicy']; visitTypes: VisitType[]; description: string; place?: Location['kind'] };

/** Only care Geneus already runs a workflow for: visit types and admission. */
export const CARE_SERVICE_PRESETS: readonly CarePreset[] = [
  { key: 'general-outpatient', name: 'General outpatient consultation', category: 'consultation', intakePolicy: 'both', visitTypes: ['general', 'follow_up'], description: 'Walk-in and booked visits with a doctor or CHEW.' },
  { key: 'specialist-consultation', name: 'Specialist consultation', category: 'consultation', intakePolicy: 'scheduled', visitTypes: ['general', 'follow_up'], description: 'Booked clinics with a specialist.' },
  { key: 'emergency', name: 'Emergency care', category: 'consultation', intakePolicy: 'walk_in', visitTypes: ['emergency'], description: 'Unbooked urgent care.' },
  { key: 'antenatal', name: 'Antenatal care', category: 'preventive', intakePolicy: 'both', visitTypes: ['antenatal'], description: 'Pregnancy check-ups and the antenatal register.' },
  { key: 'delivery', name: 'Labour and delivery', category: 'nursing', intakePolicy: 'walk_in', visitTypes: ['delivery', 'postnatal'], description: 'Births attended at the hospital, and postnatal checks.' },
  { key: 'immunisation', name: 'Immunisation', category: 'preventive', intakePolicy: 'both', visitTypes: ['immunisation', 'child_welfare'], description: 'Routine and campaign vaccinations, and child welfare.' },
  { key: 'family-planning', name: 'Family planning', category: 'preventive', intakePolicy: 'both', visitTypes: ['family_planning'], description: 'Counselling and contraception.' },
  { key: 'inpatient', name: 'Inpatient care', category: 'nursing', intakePolicy: 'walk_in', visitTypes: [], description: 'Admission to a ward bed, through Admissions.', place: 'ward' },
];
export const CARE_CONCEPT_SYSTEM = 'urn:geneus:care-service';

export const CATEGORY_LABELS: Record<CareCategory, string> = {
  consultation: 'Consultations', nursing: 'Nursing & inpatient', laboratory: 'Laboratory', pharmacy: 'Pharmacy',
  procedure: 'Procedures', preventive: 'Preventive & maternal care', rehabilitation: 'Rehabilitation', other: 'Other',
};
/** Categories offered when adding a custom care service; lab tests go through the Lab catalogue. */
export const CUSTOM_CATEGORIES: readonly CareCategory[] = ['consultation', 'nursing', 'procedure', 'preventive', 'rehabilitation', 'pharmacy', 'other'];

const key = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

/** The current care service that already provides this preset or name, if any. */
export const existingCareService = (target: { key?: string; name: string }, data: Pick<WorkforceData, 'offerings' | 'definitions'>) =>
  careServiceOfferings(data.offerings, data.definitions).find((o) => {
    const definition = data.definitions.find((d) => d.id === o.serviceDefinitionId);
    return key(o.name) === key(target.name) || (definition && (key(definition.name) === key(target.name)
      || (target.key && definition.concept.system === CARE_CONCEPT_SYSTEM && definition.concept.code === target.key)));
  });

/** A definition that can be reused instead of creating a second one with the same meaning. */
const reusableDefinition = (target: { key?: string; name: string }, definitions: readonly ServiceDefinition[]) =>
  definitions.find((d) => d.active && !d.investigation && ((target.key && d.concept.system === CARE_CONCEPT_SYSTEM && d.concept.code === target.key) || key(d.name) === key(target.name)));

export const routableTeams = (units: readonly Unit[]) => units.filter(unitIsRoutable).sort((a, b) => a.name.localeCompare(b.name));
/** Places a patient is seen in. Beds are chosen at admission, stores hold stock. */
export const carePlaces = (locations: readonly Location[]) => locations.filter((l) => l.active && !['bed', 'store', 'virtual', 'mobile'].includes(l.kind)).sort((a, b) => a.name.localeCompare(b.name));

/**
 * Sensible starting choices: a team other than the automatic Laboratory one,
 * and a place that team already uses (a ward for inpatient care).
 */
export const defaultPlacement = (preset: Pick<CarePreset, 'place'> | undefined, data: Pick<WorkforceData, 'units' | 'locations'>) => {
  const teams = routableTeams(data.units), places = carePlaces(data.locations);
  const team = teams.find((t) => key(t.name) !== 'laboratory') ?? teams[0];
  const fitting = (l: Location) => !preset?.place || l.kind === preset.place;
  const place = places.find((l) => fitting(l) && l.unitId === team?.id) ?? places.find(fitting) ?? places.find((l) => l.unitId === team?.id && key(l.name) !== 'laboratory') ?? places.find((l) => key(l.name) !== 'laboratory') ?? places[0];
  return { unitId: team?.id ?? '', locationId: place?.id ?? '' };
};

export type CareServiceInput = { key?: string; name: string; category: CareCategory; intakePolicy: ServiceOffering['intakePolicy']; visitTypes: VisitType[]; unitId: string; locationId: string };

/**
 * Adds one care service as an active offering. An existing care service with the
 * same meaning is never duplicated, and an existing definition is reused, so a
 * retry after an interrupted save creates nothing twice. Workforce rules
 * (required actions, readiness, sessions) are left for Settings.
 */
export const addCareService = async (input: CareServiceInput, data: WorkforceData, context: AuthorizationContext): Promise<ServiceOffering> => {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Enter the name of the care service');
  if (existingCareService({ key: input.key, name }, data)) throw new Error(`${name} is already one of this hospital's care services`);
  if (!input.unitId) throw new Error('Choose the team responsible for this service');
  if (!input.locationId) throw new Error('Choose where this service takes place');
  const definition = reusableDefinition({ key: input.key, name }, data.definitions)
    ?? await saveWorkforce('service_definition', { name, category: input.category, active: true, orderable: false,
      concept: input.key ? { system: CARE_CONCEPT_SYSTEM, code: input.key, label: name } : { system: 'urn:geneus:local-service', code: crypto.randomUUID(), label: name } }, context) as ServiceDefinition;
  return await saveWorkforce('service_offering', {
    serviceDefinitionId: definition.id, unitId: input.unitId, name, locationIds: [input.locationId], delivery: 'physical',
    requiredActions: [], intakePolicy: input.intakePolicy, visitTypes: input.visitTypes, timeZone: data.facility?.timeZone ?? 'Africa/Lagos',
    configuration: 'active', resourceReadiness: 'unassessed',
  }, context) as ServiceOffering;
};

/** Business status for the setup list; sync detail stays in Sync & review. */
export const careServiceStatus = (offering: ServiceOffering, data: Pick<WorkforceData, 'pending' | 'receipts' | 'rejections'>): { label: string; tone: 'green' | 'amber' | 'danger' | 'neutral' } => {
  const refused = data.receipts.some((r) => r.id === offering.id && r.outcome === 'rejected')
    || data.rejections.some((r) => r.type === 'sync_rejection' && r.entityId === offering.id && !r.resolvedOn);
  if (refused) return { label: 'Needs attention', tone: 'danger' };
  if (data.pending.has(offering.id)) return { label: 'Saving', tone: 'amber' };
  return offering.configuration === 'active' ? { label: 'Active', tone: 'green' } : offering.configuration === 'proposed' ? { label: 'Awaiting review', tone: 'amber' } : { label: 'Draft', tone: 'neutral' };
};
