import type { CrudTransaction, SyncStatus } from '@powersync/web';
import type { LocalDatabase } from '../database';

/**
 * A stand-in for the local database that records what would have been written
 * and answers reads from a small in-memory table. Enough to prove the one
 * thing the repository tests care about: whether a write reached SQLite.
 */
export type Statement = { sql: string; parameters: unknown[] };

export type FakeDatabase = LocalDatabase & {
  statements: Statement[];
  rows: Record<string, Record<string, unknown>[]>;
  transactions: CrudTransaction[];
};

const tableOf = (sql: string): string | undefined => /FROM\s+(\w+)/i.exec(sql)?.[1];

export const fakeDatabase = (seed: Record<string, Record<string, unknown>[]> = {}): FakeDatabase => {
  const statements: Statement[] = [];
  const rows = structuredClone(seed);
  const transactions: CrudTransaction[] = [];
  return {
    statements,
    rows,
    transactions,
    execute: async (sql, parameters = []) => {
      statements.push({ sql, parameters });
    },
    getAll: async <T>(sql: string) => (rows[tableOf(sql) ?? ''] ?? []) as T[],
    getOptional: async <T>(sql: string, parameters: unknown[] = []) => {
      const table = rows[tableOf(sql) ?? ''] ?? [];
      return (table.find((row) => row.id === parameters[0]) ?? null) as T | null;
    },
    onChangeWithCallback: () => () => undefined,
    registerListener: () => () => undefined,
    currentStatus: {} as SyncStatus,
    connect: async () => undefined,
    disconnectAndClear: async () => undefined,
    waitForFirstSync: async () => undefined,
    getNextCrudTransaction: async () => transactions.shift() ?? null,
  };
};
