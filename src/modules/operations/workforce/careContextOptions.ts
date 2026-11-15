import { careServiceOfferings, isLabTestOffering, type ServiceDefinition, type ServiceOffering } from '@shared';

/**
 * The services a clinician can say they are working in. Care services come
 * first; lab tests stay selectable because a clinical approval may be scoped to
 * individual tests, but are labelled as tests so they are not mistaken for a
 * kind of care.
 */
export const careContextOptions = (offerings: readonly ServiceOffering[], definitions: readonly Pick<ServiceDefinition, 'id' | 'investigation'>[]) => {
  const active = offerings.filter((o) => o.configuration === 'active');
  const byName = (a: ServiceOffering, b: ServiceOffering) => a.name.localeCompare(b.name);
  const care = careServiceOfferings(active, definitions).sort(byName);
  const tests = active.filter((o) => isLabTestOffering(o, definitions)).sort(byName);
  return [...care.map((o) => ({ value: o.id, label: o.name })), ...tests.map((o) => ({ value: o.id, label: `Lab test · ${o.name}` }))];
};
