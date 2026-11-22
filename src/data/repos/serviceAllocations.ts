import {
  ServiceChargeAllocation,
  allocatedQuantity,
  currentAllocation,
  type CoverageAllocation,
  type AuthorizationContext,
  type SyncRejection,
} from '@shared';
import { assertAllowed } from '@/auth/authorization';
import { allOfType, envelope, insertRecord, newId } from '../db';
import { integratedBillingEnabled } from '../integratedBillingSupport';
import { listWorkforceReceipts } from './workforceReceipts';
export const listServiceAllocations = async () => {
  const [records, rejections, receipts] = await Promise.all([
    allOfType<ServiceChargeAllocation>('service_charge_allocation'),
    allOfType<SyncRejection>('sync_rejection'),
    listWorkforceReceipts(),
  ]);
  const refused = new Set([
    ...rejections
      .filter((r) => r.entityType === 'service_charge_allocation')
      .map((r) => r.entityId),
    ...receipts.filter((r) => r.outcome === 'rejected').map((r) => r.id),
  ]);
  return records.filter((a) => a.acceptedOn || !refused.has(a.id));
};
export const requestServiceAllocation = async (
  input: Omit<
    ServiceChargeAllocation,
    keyof ReturnType<typeof envelope> | 'id' | 'type' | 'acceptedOn' | 'creditMinor'
  >,
  context: AuthorizationContext,
) => {
  assertAllowed(context, 'charge:associate');
  if ('acceptedOn' in input || 'creditMinor' in input) {
    throw new Error('Only the server can confirm an association or calculate its credit');
  }
  if (input.creditReturnedUnits) {
    const decisions = await allOfType<CoverageAllocation>('coverage_allocation');
    if (currentAllocation(input.chargeId, decisions)?.state === 'finalised') {
      throw new Error('Confirm an insured return online with a verified insurance reviewer');
    }
    assertAllowed(context, 'payment:waive');
  }
  if (!integratedBillingEnabled(context)) {
    throw new Error(
      'Connect compatible devices and finish the financial-reader transition before associating services',
    );
  }
  const records = await listServiceAllocations();
  if (
    records.some(
      (a) =>
        !a.acceptedOn &&
        a.sourceEntryId === input.sourceEntryId &&
        a.sourceItemId === input.sourceItemId,
    )
  ) {
    throw new Error('This source already has an unconfirmed request. Wait for its server outcome');
  }
  const record = ServiceChargeAllocation.parse({
    ...input,
    ...envelope(context),
    id: newId('service_charge_allocation'),
    type: 'service_charge_allocation',
  });
  return insertRecord<ServiceChargeAllocation>(
    context,
    'charge:associate',
    'service_charge_allocation',
    record,
  );
};
export { allocatedQuantity };
