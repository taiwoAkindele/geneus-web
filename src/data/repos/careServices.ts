import {
  careServiceVisitIssues,
  visitCareServices,
  type AuthorizationContext,
  type ServiceDefinition,
  type ServiceOffering,
  type VisitType,
} from '@shared';
import { allOfType } from '../db';

/** The hospital's service records, read once for every place a care service is chosen or shown. */
export const loadCareServices = async () => {
  const [offerings, definitions] = await Promise.all([
    allOfType<ServiceOffering>('service_offering'),
    allOfType<ServiceDefinition>('service_definition'),
  ]);

  return { offerings, definitions };
};

export type CareServiceRecords = Awaited<ReturnType<typeof loadCareServices>>;

export const CARE_SERVICE_WATCH = ['service_offering', 'service_definition'] as const;

/** What a booking, registration or visit records about its care: the service, when there is one, and the visit type. */
export type CareVisitChoice = { offeringId?: string; visitType: VisitType };

/** Services a patient can be booked or registered for on this kind of arrival. */
export const careServicesFor = (
  records: CareServiceRecords | undefined,
  arrival?: 'scheduled' | 'walk_in',
) => (records ? visitCareServices(records.offerings, records.definitions, arrival) : []);

/** Checks a new choice on this device: the service must be active now. The server re-checks when it syncs. */
export const checkCareServiceChoice = async (
  choice: CareVisitChoice,
  context: AuthorizationContext,
) => {
  if (!choice.offeringId) {
    return;
  }

  const issues = careServiceVisitIssues(
    { facilityId: context.facilityId, ...choice },
    await loadCareServices(),
  );

  if (issues.length) {
    throw new Error(issues.join('. '));
  }
};

/** The display name of a recorded care service, kept even after the service is retired. */
export const careServiceName = (
  records: CareServiceRecords | undefined,
  offeringId: string | undefined,
) => (offeringId ? records?.offerings.find((o) => o.id === offeringId)?.name : undefined);
