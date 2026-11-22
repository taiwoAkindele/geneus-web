import {
  labTestKey,
  unitIsRoutable,
  type AuthorizationContext,
  type FeeItem,
  type InvestigationItem,
  type Location,
  type ServiceDefinition,
  type ServiceOffering,
  type StandardTest,
  type Unit,
} from '@shared';
import { allOfType } from '../db';
import { getDatabase } from '../database';
import { fromRow, type Row } from '../rows';
import { TABLE_FOR } from '../tables';
import { billingCatalogueEnabled } from '../billingCatalogueSupport';
import { getFacility } from './facility';
import { saveWorkforce } from './workforce';
import { assertAllowed } from '@/auth/authorization';

export const loadInvestigationCatalogue = async () => {
  const [definitions, offerings, fees, units, locations, facility] = await Promise.all([
    allOfType<ServiceDefinition>('service_definition'),
    allOfType<ServiceOffering>('service_offering'),
    allOfType<FeeItem>('fee_item'),
    allOfType<Unit>('unit'),
    allOfType<Location>('location'),
    getFacility(),
  ]);
  return {
    definitions,
    offerings,
    fees,
    units,
    locations,
    facility,
    items: [
      ...(billingCatalogueEnabled()
        ? fees
            .filter((f) => f.active && f.category === 'laboratory')
            .map((fee) => {
              const direct = definitions.find(
                (d) => d.active && d.orderable && d.feeItemId === fee.id,
              );
              const offering = direct
                ? undefined
                : offerings.find(
                    (o) =>
                      o.feeItemId === fee.id &&
                      o.configuration === 'active' &&
                      o.resourceReadiness === 'available' &&
                      definitions.some(
                        (d) =>
                          d.id === o.serviceDefinitionId &&
                          d.active &&
                          d.orderable &&
                          d.investigation,
                      ),
                  );
              return {
                fee,
                central: true as const,
                definition:
                  direct ?? definitions.find((d) => d.id === offering?.serviceDefinitionId),
                offering,
              };
            })
        : []),
      ...offerings.flatMap((offering) => {
        const definition = definitions.find(
          (d) =>
            d.id === offering.serviceDefinitionId && d.active && d.orderable && d.investigation,
        );
        if (
          !definition ||
          offering.configuration !== 'active' ||
          offering.resourceReadiness !== 'available'
        ) {
          return [];
        }
        const fee = fees.find((f) => f.id === offering.feeItemId && f.active);
        if (billingCatalogueEnabled() && fee?.category === 'laboratory') {
          return [];
        }
        return [{ offering, definition, fee, central: false as const }];
      }),
    ],
  };
};
export type InvestigationCatalogue = Awaited<ReturnType<typeof loadInvestigationCatalogue>>;
export const selectInvestigation = ({
  definition,
  offering,
  fee,
  central,
}: InvestigationCatalogue['items'][number]): InvestigationItem => ({
  id: `order_item:${crypto.randomUUID()}`,
  name: central ? fee!.name : offering!.name,
  ...(central ? { catalogueSource: 'billing' as const, exemptions: fee!.exemptions } : {}),
  serviceDefinitionId: definition?.id,
  offeringId: offering?.id,
  catalogueRevision: offering?.revision,
  definitionRevision: definition?.revision,
  specimen: definition?.investigation?.specimen,
  priority: 'routine',
  ...(fee
    ? {
        feeItemId: fee.id,
        feePriceVersion: fee.priceVersion,
        priceMinor: fee.amountMinor,
        currency: fee.currency,
      }
    : {}),
});

export type OwnTest = { name: string; specimen: string; classification: string; aliases: string[] };
export type AddedTests = { added: string[]; skipped: string[] };
const isLaboratory = (name: string) => name.trim().toLowerCase() === 'laboratory';

/**
 * Every catalogue test is filed under the facility's Laboratory unit and location.
 * An existing active "Laboratory" is reused; otherwise this device creates one.
 * They decide nothing about who performs a test.
 */
const laboratoryPlacement = async (context: AuthorizationContext) => {
  const [units, locations] = await Promise.all([
    allOfType<Unit>('unit'),
    allOfType<Location>('location'),
  ]);
  const unit =
    units.find((u) => isLaboratory(u.name) && unitIsRoutable(u)) ??
    ((await saveWorkforce(
      'unit',
      { name: 'Laboratory', active: true, kind: 'unit' },
      context,
    )) as Unit);
  const location =
    locations.find((l) => isLaboratory(l.name) && l.active) ??
    ((await saveWorkforce(
      'location',
      { name: 'Laboratory', kind: 'room', active: true, unitId: unit.id },
      context,
    )) as Location);
  return { unitId: unit.id, locationId: location.id };
};

/**
 * Adds lab tests on this device, offline included. A test whose name or other name
 * is already taken, here or earlier in the list, is skipped. The server repeats the
 * checks when the tests sync, including that a standard test matches its list.
 */
const addTests = async (
  tests: readonly (OwnTest & { concept?: ServiceDefinition['concept'] })[],
  context: AuthorizationContext,
): Promise<AddedTests> => {
  assertAllowed(context, 'service:manage');
  const facility = await getFacility();
  const taken = new Set(
    (await allOfType<ServiceDefinition>('service_definition'))
      .filter((d) => d.active && d.investigation)
      .flatMap((d) => [d.name, ...(d.investigation?.aliases ?? [])].map(labTestKey)),
  );
  const added: string[] = [];
  const skipped: string[] = [];
  let placement: Awaited<ReturnType<typeof laboratoryPlacement>> | undefined;
  for (const test of tests) {
    const name = test.name.trim().replace(/\s+/g, ' ');
    const aliases = [
      ...new Set(
        test.aliases
          .map((alias) => alias.trim())
          .filter((alias) => alias && labTestKey(alias) !== labTestKey(name)),
      ),
    ];
    const keys = [name, ...aliases].map(labTestKey);
    if (!name || keys.some((key) => taken.has(key))) {
      skipped.push(test.name.trim());
      continue;
    }
    keys.forEach((key) => taken.add(key));
    placement ??= await laboratoryPlacement(context);
    const id = `service_definition:${crypto.randomUUID()}`;
    await saveWorkforce(
      'service_definition',
      {
        name,
        category: 'laboratory',
        concept: test.concept ?? { system: 'local', code: id, label: name },
        orderable: true,
        active: true,
        investigation: {
          specimen: test.specimen.trim(),
          department: test.classification.trim(),
          aliases,
        },
      },
      context,
      undefined,
      id,
    );
    await saveWorkforce(
      'service_offering',
      {
        serviceDefinitionId: id,
        unitId: placement.unitId,
        name,
        locationIds: [placement.locationId],
        delivery: 'physical',
        requiredActions: ['perform_test', 'record_result'],
        intakePolicy: 'both',
        timeZone: facility?.timeZone ?? 'Africa/Lagos',
        configuration: 'active',
        resourceReadiness: 'available',
      },
      context,
    );
    added.push(name);
  }
  return { added, skipped };
};
export const addOwnTests = (tests: readonly OwnTest[], context: AuthorizationContext) =>
  addTests(tests, context);
/** Standard tests come from this facility's downloaded copy of the server's list, copied exactly. */
export const adoptStandardTests = async (
  keys: readonly string[],
  context: AuthorizationContext,
) => {
  const standards = (await allOfType<StandardTest>('standard_test')).filter((s) =>
    keys.includes(s.key),
  );
  return addTests(
    standards.map((s) => ({
      name: s.name,
      specimen: s.specimen,
      classification: s.classification,
      aliases: s.aliases,
      concept: s.concept,
    })),
    context,
  );
};
/** The facility's standard tests, marked when one is already in the catalogue. */
export const loadStandardTests = async () => {
  const [standards, definitions] = await Promise.all([
    allOfType<StandardTest>('standard_test'),
    allOfType<ServiceDefinition>('service_definition'),
  ]);
  const taken = new Set(
    definitions
      .filter((d) => d.active && d.investigation)
      .flatMap((d) => [d.name, ...(d.investigation?.aliases ?? [])].map(labTestKey)),
  );
  return standards
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => ({ ...s, added: [s.name, ...s.aliases].some((n) => taken.has(labTestKey(n))) }));
};
export type StandardTestOption = Awaited<ReturnType<typeof loadStandardTests>>[number];

/** Tests are added on any device and checked by the server when they sync. */
export type CatalogueRow = {
  definition: ServiceDefinition;
  offering?: ServiceOffering;
  fee?: FeeItem;
  template?: { name: string; parts: number };
};
/**
 * One page of this facility's lab tests, read with LIMIT/OFFSET from the local
 * replica so long catalogues stay fast offline. Search covers names, other names,
 * specimen and classification.
 */
export const loadCataloguePage = async (
  context: AuthorizationContext,
  {
    query = '',
    page = 0,
    pageSize = 25,
    descending = false,
  }: { query?: string; page?: number; pageSize?: number; descending?: boolean },
) => {
  const db = getDatabase();
  const like = `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const where = `WHERE "facilityId" = ? AND "category" = 'laboratory' AND "active" = 1 AND "investigation" IS NOT NULL AND ("name" LIKE ? ESCAPE '\\' OR "investigation" LIKE ? ESCAPE '\\')`;
  const parameters = [context.facilityId, like, like];
  const [count, rows] = await Promise.all([
    db.getOptional<{ total: number }>(
      `SELECT COUNT(*) AS total FROM ${TABLE_FOR.service_definition} ${where}`,
      parameters,
    ),
    db.getAll<Row>(
      `SELECT * FROM ${TABLE_FOR.service_definition} ${where} ORDER BY "name" COLLATE NOCASE ${descending ? 'DESC' : 'ASC'} LIMIT ? OFFSET ?`,
      [...parameters, pageSize, Math.max(0, page) * pageSize],
    ),
  ]);
  const definitions = rows.map((row) => fromRow<ServiceDefinition>('service_definition', row));
  const ids = definitions.map((d) => d.id);
  const marks = ids.map(() => '?').join(',');
  const offerings = ids.length
    ? (
        await db.getAll<Row>(
          `SELECT * FROM ${TABLE_FOR.service_offering} WHERE "serviceDefinitionId" IN (${marks})`,
          ids,
        )
      ).map((row) => fromRow<ServiceOffering>('service_offering', row))
    : [];
  const feeIds = [
    ...new Set([...definitions, ...offerings].flatMap((o) => (o.feeItemId ? [o.feeItemId] : []))),
  ];
  const fees = feeIds.length
    ? (
        await db.getAll<Row>(
          `SELECT * FROM ${TABLE_FOR.fee_item} WHERE id IN (${feeIds.map(() => '?').join(',')})`,
          feeIds,
        )
      ).map((row) => fromRow<FeeItem>('fee_item', row))
    : [];
  // The result template in use for each test on this page; a test has at most one.
  const templates = ids.length
    ? await db.getAll<{ test: string; name: string; parts: number }>(
        `SELECT j.value AS test, t."name" AS name, json_array_length(t."parts") AS parts FROM ${TABLE_FOR.result_template} t, json_each(t."serviceDefinitionIds") j WHERE t."status" = 'active' AND j.value IN (${marks})`,
        ids,
      )
    : [];
  const items: CatalogueRow[] = definitions.map((definition) => {
    const own = offerings.filter((o) => o.serviceDefinitionId === definition.id);
    const offering = own.find((o) => o.configuration === 'active') ?? own[0];
    const template = templates.find((t) => t.test === definition.id);
    return {
      definition,
      offering,
      fee: fees.find((f) => f.id === (definition.feeItemId ?? offering?.feeItemId) && f.active),
      ...(template ? { template: { name: template.name, parts: Number(template.parts) } } : {}),
    };
  });
  return { items, total: Number(count?.total ?? 0) };
};

/** Associates existing clinical configuration with a central fee; never authors prices. */
export const linkInvestigationFee = async (
  offering: ServiceOffering,
  feeItemId: string,
  context: AuthorizationContext,
) => {
  const catalogue = await loadInvestigationCatalogue();
  if (
    !catalogue.fees.some(
      (fee) =>
        fee.id === feeItemId &&
        fee.facilityId === context.facilityId &&
        fee.active &&
        (fee.category === 'laboratory' || fee.id === offering.feeItemId),
    )
  ) {
    throw new Error('Choose an active central Laboratory item');
  }
  return saveWorkforce('service_offering', { feeItemId }, context, offering);
};
export const linkInvestigationDefinition = async (
  definition: ServiceDefinition,
  feeItemId: string,
  context: AuthorizationContext,
) => {
  const fee = (await allOfType<FeeItem>('fee_item')).find(
    (f) =>
      f.id === feeItemId &&
      f.facilityId === context.facilityId &&
      f.active &&
      f.category === 'laboratory',
  );
  if (!fee) {
    throw new Error('Choose an active central Laboratory item');
  }
  const offerings = (await allOfType<ServiceOffering>('service_offering')).filter(
    (o) => o.serviceDefinitionId === definition.id,
  );
  if ([definition, ...offerings].some((o) => o.feeItemId && o.feeItemId !== feeItemId)) {
    throw new Error(
      'This clinical definition already references a different fee. Review its existing association before changing it.',
    );
  }
  return saveWorkforce('service_definition', { feeItemId }, context, definition);
};
