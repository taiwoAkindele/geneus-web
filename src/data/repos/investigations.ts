import { unitIsRoutable } from '@shared';
import type { AuthorizationContext, FeeItem, InvestigationItem, Location, ServiceDefinition, ServiceOffering, Unit } from '@shared';
import { allOfType, envelope, insertRecords, newId } from '../db';
import { getFacility } from './facility';
import { saveWorkforce } from './workforce';
import { assertAllowed } from '@/auth/authorization';

export const loadInvestigationCatalogue = async () => {
  const [definitions, offerings, fees, units, locations, facility] = await Promise.all([
    allOfType<ServiceDefinition>('service_definition'), allOfType<ServiceOffering>('service_offering'),
    allOfType<FeeItem>('fee_item'), allOfType<Unit>('unit'), allOfType<Location>('location'), getFacility(),
  ]);
  return { definitions, offerings, fees, units, locations, facility,
    items: offerings.flatMap((offering) => {
      const definition = definitions.find((d) => d.id === offering.serviceDefinitionId && d.active && d.orderable && d.investigation);
      if (!definition || offering.configuration !== 'active' || offering.resourceReadiness !== 'available') return [];
      const fee = fees.find((f) => f.id === offering.feeItemId && f.active);
      return [{ offering, definition, fee }];
    }),
  };
};
export type InvestigationCatalogue = Awaited<ReturnType<typeof loadInvestigationCatalogue>>;
export const selectInvestigation = ({ definition, offering, fee }: InvestigationCatalogue['items'][number]): InvestigationItem => ({
  id: `order_item:${crypto.randomUUID()}`, name: offering.name,
  serviceDefinitionId: definition.id, offeringId: offering.id, catalogueRevision: offering.revision, definitionRevision: definition.revision,
  specimen: definition.investigation!.specimen, priority: 'routine',
  ...(fee ? { feeItemId: fee.id, feePriceVersion: fee.priceVersion, priceMinor: fee.amountMinor, currency: fee.currency } : {}),
});

export const createInvestigation = async (draft: { name: string; specimen: string; department: string; unitId: string; locationId: string; feeItemId?: string }, context: AuthorizationContext) => {
  assertAllowed(context, 'service:manage');
  const catalogue = await loadInvestigationCatalogue();
  if (!catalogue.units.some((u) => u.id === draft.unitId && u.facilityId === context.facilityId && unitIsRoutable(u))) throw new Error('Choose an active facility unit');
  if (!catalogue.locations.some((l) => l.id === draft.locationId && l.facilityId === context.facilityId && l.active)) throw new Error('Choose an active facility location');
  if (draft.feeItemId && !catalogue.fees.some((f) => f.id === draft.feeItemId && f.facilityId === context.facilityId && f.active)) throw new Error('Choose an active facility fee');
  const definitionId = newId('service_definition');
  const definition: ServiceDefinition = { ...envelope(context), id: definitionId, type: 'service_definition', name: draft.name.trim(), category: 'laboratory', concept: { system: 'local', code: definitionId, label: draft.name.trim() }, orderable: true, active: true, revision: 1, investigation: { specimen: draft.specimen.trim(), department: draft.department.trim(), aliases: [] } };
  const offering: ServiceOffering = { ...envelope(context), id: newId('service_offering'), type: 'service_offering', serviceDefinitionId: definitionId, unitId: draft.unitId, name: draft.name.trim(), locationIds: [draft.locationId], delivery: 'physical', requiredActions: ['perform_test', 'record_result'], intakePolicy: 'both', timeZone: catalogue.facility?.timeZone ?? 'Africa/Lagos', configuration: 'active', resourceReadiness: 'available', revision: 1, feeItemId: draft.feeItemId || undefined };
  return insertRecords(context, [{ type: 'service_definition', permission: 'service:manage', record: definition }, { type: 'service_offering', permission: 'service:manage', record: offering }]);
};

export const linkInvestigationFee = async (offering: ServiceOffering, feeItemId: string, context: AuthorizationContext) => {
  const catalogue = await loadInvestigationCatalogue();
  if (!catalogue.fees.some((fee) => fee.id === feeItemId && fee.facilityId === context.facilityId && fee.active)) throw new Error('Choose an active fee belonging to this facility');
  return saveWorkforce('service_offering', { feeItemId }, context, offering);
};
