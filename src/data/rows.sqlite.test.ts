import { describe, expect, it, vi } from 'vitest';
import { EncounterEntry } from '@shared';
import { fieldKindsFor } from './contractShape';
import { fromRow, toRow, type Row } from './rows';

const moduleName = 'node:sqlite';
type Sqlite = { DatabaseSync: new (path: string) => { exec: (sql: string) => void; prepare: (sql: string) => { run: (...values: unknown[]) => unknown; get: () => Row | undefined }; close: () => void } };
const { DatabaseSync } = await import(/* @vite-ignore */ moduleName) as Sqlite;

describe('workflow versions already stored with SQLite text affinity', () => {
  it('recovers numeric version 1 from an existing text column without rewriting the care entry', () => {
    const db = new DatabaseSync(':memory:');
    const entry = EncounterEntry.parse({ type: 'encounter_entry', id: 'entry:legacy-version', facilityId: 'TEST', deviceId: 'device:one', createdBy: 'staff:doctor', createdOn: '2026-11-05T09:00:00Z', schemaVersion: 5,
      patientId: 'TEST-000001-K2', encounterId: 'visit:one', workflowVersion: 1, actorRole: 'doctor', step: 'complaint', values: { note: 'Synthetic signed care' } });
    const row = toRow(entry.type, entry), fields = Object.keys(row), kinds = fieldKindsFor(entry.type);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      db.exec(`CREATE TABLE legacy_entries (${fields.map((field) => `"${field}" ${field === 'workflowVersion' ? 'TEXT' : kinds[field] === 'number' ? 'REAL' : 'TEXT'}`).join(',')})`);
      db.prepare(`INSERT INTO legacy_entries (${fields.map((field) => `"${field}"`).join(',')}) VALUES (${fields.map(() => '?').join(',')})`).run(...Object.values(row));
      const stored = db.prepare('SELECT * FROM legacy_entries').get() as Row;
      expect(typeof stored.workflowVersion).toBe('string');
      expect(Number(stored.workflowVersion)).toBe(1);
      expect(fromRow('encounter_entry', stored)).toEqual(entry);
      expect(warning).not.toHaveBeenCalled();
      expect(db.prepare('SELECT workflowVersion FROM legacy_entries').get()?.workflowVersion).toBe(stored.workflowVersion);
    } finally { warning.mockRestore(); db.close(); }
  });
});
