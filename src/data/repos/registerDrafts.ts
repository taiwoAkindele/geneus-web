import { z } from 'zod';
import { RegisterDefinition, RegisterFieldDef, type AuthorizationContext } from '@shared';
import { assertAllowed } from '@/auth/authorization';
import { getDatabase } from '../database';
import { nowIso } from '../db';
import { REGISTER_DRAFTS_TABLE } from '../tables';
import type { RegisterDraft } from './registers';

/** Private unfinished typing can be incomplete; only an explicit save publishes a synced snapshot. */
const Recovery = RegisterDefinition.pick({ name: true, category: true, description: true }).extend({
  name: z.string(), category: z.string(), baseVersion: z.number().int().nonnegative(),
  fields: z.array(RegisterFieldDef.extend({ label: z.string() })),
});
export type RegisterRecovery = z.infer<typeof Recovery>;
const idOf = (context: AuthorizationContext, key: string) => [context.facilityId, context.userId, key].join('|');

export const readRegisterRecovery = async (context: AuthorizationContext, key: string): Promise<RegisterRecovery | undefined> => {
  assertAllowed(context, 'register_definition:publish');
  const row = await getDatabase().getOptional<{ data: string }>(`SELECT data FROM ${REGISTER_DRAFTS_TABLE} WHERE id = ?`, [idOf(context, key)]);
  return row ? Recovery.parse(JSON.parse(row.data)) : undefined;
};
export const writeRegisterRecovery = async (context: AuthorizationContext, key: string, draft: RegisterDraft, baseVersion: number): Promise<void> => {
  assertAllowed(context, 'register_definition:publish');
  const data = Recovery.parse({ ...draft, baseVersion });
  await getDatabase().execute(`INSERT INTO ${REGISTER_DRAFTS_TABLE} (id, "staffId", "registerKey", data, "updatedOn") VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data, "updatedOn" = excluded."updatedOn"`, [idOf(context, key), context.userId, key, JSON.stringify(data), nowIso()]);
};
export const discardRegisterRecovery = async (context: AuthorizationContext, key: string): Promise<void> => {
  assertAllowed(context, 'register_definition:publish');
  await getDatabase().execute(`DELETE FROM ${REGISTER_DRAFTS_TABLE} WHERE id = ?`, [idOf(context, key)]);
};
