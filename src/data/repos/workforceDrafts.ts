import { FACILITY_DOCUMENT_POLICY, type AuthorizationContext } from '@shared';
import { assertAllowed } from '@/auth/authorization';
import { getDatabase } from '../database';
import { WORKFORCE_DRAFTS_TABLE } from '../tables';
const identity = (context: AuthorizationContext, slot: string) => JSON.stringify([context.facilityId, context.deviceId, context.userId, slot]);
const authorize = (context: AuthorizationContext, slot: string) => {
  const type = slot.split(':')[0], policy = FACILITY_DOCUMENT_POLICY[type as keyof typeof FACILITY_DOCUMENT_POLICY];
  if (policy && 'permission' in policy)
    assertAllowed(context, policy.permission);
  else
    assertAllowed(context, type === 'billing_department' ? 'fee_item:manage' : 'unit:manage');
};
/** Inside the encrypted database, keyed by the current staff and device; never synced. */
export const readWorkforceDraft = async <T>(context: AuthorizationContext, slot: string): Promise<T | undefined> => {
  authorize(context, slot);
  const row = await getDatabase().getOptional<{
    data: string;
  }>(`SELECT data FROM ${WORKFORCE_DRAFTS_TABLE} WHERE id = ?`, [identity(context, slot)]);
  return row ? JSON.parse(row.data) as T : undefined;
};
export const writeWorkforceDraft = async (context: AuthorizationContext, slot: string, values: unknown): Promise<void> => {
  authorize(context, slot);
  await getDatabase().execute(`INSERT OR REPLACE INTO ${WORKFORCE_DRAFTS_TABLE}(id,staffId,deviceId,slot,data,updatedOn) VALUES(?,?,?,?,?,?)`, [identity(context, slot), context.userId, context.deviceId, slot, JSON.stringify(values), new Date().toISOString()]);
};
export const clearWorkforceDraft = async (context: AuthorizationContext, slot: string): Promise<void> => {
  authorize(context, slot);
  await getDatabase().execute(`DELETE FROM ${WORKFORCE_DRAFTS_TABLE} WHERE id = ?`, [identity(context, slot)]);
};
