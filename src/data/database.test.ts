import { describe, expect, it } from 'vitest';
import { canRetireLegacy, type LocalDatabase } from './database';

/** Only what the retirement rule reads: the upload queue and the last completed sync. */
const database = (pending: number, status: { hasSynced?: boolean; lastSyncedAt?: Date }): LocalDatabase =>
  ({
    getOptional: async () => ({ n: pending }),
    currentStatus: status,
  }) as unknown as LocalDatabase;

const at = (iso: string) => new Date(iso);

/**
 * Deleting the old plaintext database is the one destructive step of the move
 * to encryption, so the rule for when it is safe is pinned here: never with
 * writes still to upload, never before the encrypted copy has caught up.
 */
describe('retiring the plaintext database', () => {
  const synced = { hasSynced: true, lastSyncedAt: at('2026-10-01T09:00:00Z') };

  it('waits while the legacy database still has writes to upload', async () => {
    expect(await canRetireLegacy(database(2, synced), database(0, synced))).toBe(false);
  });

  it('waits until the encrypted copy has completed a sync', async () => {
    expect(await canRetireLegacy(database(0, synced), database(0, { hasSynced: false }))).toBe(false);
  });

  it('waits while the encrypted copy is behind the legacy one, so an offline phone keeps today\'s roster', async () => {
    const behind = { hasSynced: true, lastSyncedAt: at('2026-09-30T09:00:00Z') };
    expect(await canRetireLegacy(database(0, synced), database(0, behind))).toBe(false);
  });

  it('retires it once nothing is pending and the encrypted copy is as current', async () => {
    expect(await canRetireLegacy(database(0, synced), database(0, synced))).toBe(true);
    expect(await canRetireLegacy(database(0, {}), database(0, synced))).toBe(true);
  });
});
