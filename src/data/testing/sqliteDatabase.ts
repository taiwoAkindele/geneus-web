import type { AnyDocument, DocType } from '@shared';
import { fieldKindsFor } from '../contractShape';
import type { LocalDatabase } from '../database';
import { toRow } from '../rows';
import { TABLE_FOR, CLINICAL_REVIEWS_TABLE, WORKFORCE_RECEIPTS_TABLE } from '../tables';
import { fakeDatabase } from './fakeDatabase';
type Statement = { run: (...values: unknown[]) => unknown; all: (...values: unknown[]) => unknown[]; get: (...values: unknown[]) => unknown };
type Sqlite = { DatabaseSync: new (path: string) => { exec: (sql: string) => void; prepare: (sql: string) => Statement; close: () => void } };
const moduleName = 'node:sqlite';
const { DatabaseSync } = await import(/* @vite-ignore */ moduleName) as Sqlite;
export const sqliteTestDatabase = () => {
  const sqlite = new DatabaseSync(':memory:');
  for (const [type, table] of Object.entries(TABLE_FOR)) sqlite.exec(`CREATE TABLE ${table}(id TEXT PRIMARY KEY,${[...Object.keys(fieldKindsFor(type as DocType)).filter((field) => field !== 'id'), '_metadata'].map((field) => `"${field}"`).join(',')})`);
  sqlite.exec(`CREATE TABLE ps_crud(id INTEGER PRIMARY KEY,data TEXT); CREATE TABLE ${WORKFORCE_RECEIPTS_TABLE}(id TEXT PRIMARY KEY,clientId INTEGER,outcome TEXT); CREATE TABLE ${CLINICAL_REVIEWS_TABLE}(id TEXT PRIMARY KEY,facilityId,staffId,semanticKey,data);`);
  const bind = (args: unknown[]) => args.map((value) => value === undefined ? null : value);
  const execute = async (sql: string, args: unknown[] = []) => sqlite.prepare(sql).run(...bind(args));
  const getOptional = async <T>(sql: string, args: unknown[] = []) => sqlite.prepare(sql).get(...bind(args)) as T ?? null;
  const db: LocalDatabase = { ...fakeDatabase(), execute, getOptional, getAll: async <T>(sql: string,args: unknown[] = []) => sqlite.prepare(sql).all(...bind(args)) as T[],
    writeTransaction: async (callback) => { sqlite.exec('BEGIN'); try { const result = await callback({execute,getOptional}); sqlite.exec('COMMIT'); return result; } catch (cause) { sqlite.exec('ROLLBACK'); throw cause; } },
    close: async () => sqlite.close(),
  };
  const seed = async (record: AnyDocument) => { const row=toRow(record.type,record),fields=Object.keys(row); await execute(`INSERT INTO ${TABLE_FOR[record.type]}(${fields.map((field)=>`"${field}"`).join(',')}) VALUES(${fields.map(()=>'?').join(',')})`,Object.values(row)); };
  return { db, seed };
};
