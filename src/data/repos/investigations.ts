import type { AuthorizationContext, FeeItem, InvestigationItem, Location, ServiceDefinition, ServiceOffering, Unit } from '@shared';
import { allOfType } from '../db';
import { getDatabase } from '../database';
import { fromRow, type Row } from '../rows';
import { TABLE_FOR } from '../tables';
import { createFeeItem, updateFeeItem } from './billing';
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

/** Tests are added only by the server (lib/api/investigations.ts) and arrive here by sync. */
export type CatalogueRow = { definition: ServiceDefinition; offering?: ServiceOffering; fee?: FeeItem };
/**
 * One page of this facility's lab tests, read with LIMIT/OFFSET from the local
 * replica so long catalogues stay fast offline. Search covers names, other names,
 * specimen and classification.
 */
export const loadCataloguePage = async (context: AuthorizationContext, { query = '', page = 0, pageSize = 25, descending = false }: { query?: string; page?: number; pageSize?: number; descending?: boolean }) => {
  const db = getDatabase(), like = `%${query.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const where = `WHERE "facilityId" = ? AND "category" = 'laboratory' AND "active" = 1 AND "investigation" IS NOT NULL AND ("name" LIKE ? ESCAPE '\\' OR "investigation" LIKE ? ESCAPE '\\')`;
  const parameters = [context.facilityId, like, like];
  const [count, rows] = await Promise.all([
    db.getOptional<{ total: number }>(`SELECT COUNT(*) AS total FROM ${TABLE_FOR.service_definition} ${where}`, parameters),
    db.getAll<Row>(`SELECT * FROM ${TABLE_FOR.service_definition} ${where} ORDER BY "name" COLLATE NOCASE ${descending ? 'DESC' : 'ASC'} LIMIT ? OFFSET ?`, [...parameters, pageSize, Math.max(0, page) * pageSize]),
  ]);
  const definitions = rows.map((row) => fromRow<ServiceDefinition>('service_definition', row));
  const ids = definitions.map((d) => d.id), marks = ids.map(() => '?').join(',');
  const offerings = ids.length ? (await db.getAll<Row>(`SELECT * FROM ${TABLE_FOR.service_offering} WHERE "serviceDefinitionId" IN (${marks})`, ids)).map((row) => fromRow<ServiceOffering>('service_offering', row)) : [];
  const feeIds = [...new Set(offerings.flatMap((o) => o.feeItemId ? [o.feeItemId] : []))];
  const fees = feeIds.length ? (await db.getAll<Row>(`SELECT * FROM ${TABLE_FOR.fee_item} WHERE id IN (${feeIds.map(() => '?').join(',')})`, feeIds)).map((row) => fromRow<FeeItem>('fee_item', row)) : [];
  const items: CatalogueRow[] = definitions.map((definition) => {
    const own = offerings.filter((o) => o.serviceDefinitionId === definition.id), offering = own.find((o) => o.configuration === 'active') ?? own[0];
    return { definition, offering, fee: fees.find((f) => f.id === offering?.feeItemId && f.active) };
  });
  return { items, total: Number(count?.total ?? 0) };
};

/**
 * Sets a test's price. A fee used only by this test is updated; otherwise a new
 * laboratory fee charged when ordered is created and linked. Existing orders keep
 * the price they recorded.
 */
export const setInvestigationPrice = async (row: CatalogueRow, amountMinor: number, context: AuthorizationContext) => {
  assertAllowed(context, 'fee_item:manage');
  if (!row.offering) throw new Error('This test has no offering to price. Review it in Facility services');
  const catalogue = await loadInvestigationCatalogue();
  const shared = row.fee && catalogue.offerings.some((o) => o.id !== row.offering!.id && o.feeItemId === row.fee!.id);
  if (row.fee && !shared) return updateFeeItem(row.fee.id, { name: row.fee.name, category: row.fee.category, departmentId: row.fee.departmentId ?? null, amountMinor, currency: row.fee.currency, chargeWhen: row.fee.chargeWhen, exemptions: row.fee.exemptions }, context);
  const currency = row.fee?.currency ?? catalogue.fees.find((f) => f.facilityId === context.facilityId && f.active)?.currency ?? 'NGN';
  const fee = await createFeeItem({ name: row.definition.name, category: 'laboratory', departmentId: null, amountMinor, currency, chargeWhen: 'when_ordered', exemptions: [] }, context);
  return linkInvestigationFee(row.offering, fee.id, context);
};

export const linkInvestigationFee = async (offering: ServiceOffering, feeItemId: string, context: AuthorizationContext) => {
  const catalogue = await loadInvestigationCatalogue();
  if (!catalogue.fees.some((fee) => fee.id === feeItemId && fee.facilityId === context.facilityId && fee.active)) throw new Error('Choose an active fee belonging to this facility');
  return saveWorkforce('service_offering', { feeItemId }, context, offering);
};
