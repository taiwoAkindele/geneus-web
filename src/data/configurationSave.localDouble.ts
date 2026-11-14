import type { AuthorizationContext } from '@shared';
import { getDatabase } from './database';
import { toRow } from './rows';
import { TABLE_FOR } from './tables';
// Types only: a runtime import of the module this stands in for would wait on itself while it is being mocked.
import type { ConfigurationWrite } from './configurationSave';

/**
 * For unit tests only: stands in for the server and sync. It applies an
 * accepted configuration save to the local database exactly as sync would
 * deliver it, with the server's revision check, so screens and repositories
 * can be tested against real SQLite without a network.
 */
const REVISIONED = ['unit', 'billing_department', 'location', 'service_definition', 'service_offering', 'practitioner_profile', 'result_template', 'result_part', 'answer_list'];
const quote = (name: string) => `"${name}"`;

export const saveConfigurationLocally = async (_context: AuthorizationContext, writes: readonly ConfigurationWrite[]) => {
  await getDatabase().writeTransaction(async (tx) => {
    for (const write of writes) {
      const table = TABLE_FOR[write.type];
      if (write.op === 'put') {
        const row = toRow(write.type, write.record as unknown as Record<string, unknown>);
        const columns = Object.keys(row);
        await tx.execute(`INSERT INTO ${table} (${columns.map(quote).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, columns.map((c) => row[c]));
        continue;
      }
      const revision = write.changes.revision;
      if (REVISIONED.includes(write.type) && typeof revision === 'number') {
        const locked = await tx.getOptional<{ revision?: number }>(`SELECT revision FROM ${table} WHERE id = ?`, [write.id]);
        if (!locked || Number(locked.revision ?? 1) !== revision - 1) throw new Error('This configuration changed in another window. Reopen its current details before saving');
      }
      const row = toRow(write.type, write.changes);
      const columns = Object.keys(row);
      await tx.execute(`UPDATE ${table} SET ${columns.map((c) => `${quote(c)} = ?`).join(', ')} WHERE id = ?`, [...columns.map((c) => row[c]), write.id]);
    }
  });
  return { arrived: true };
};
