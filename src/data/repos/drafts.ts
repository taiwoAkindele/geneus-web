import { getDatabase } from '../database';
import { nowIso } from '../db';
import { DRAFTS_TABLE } from '../tables';

/**
 * Unsaved encounter work, kept on the device so a power cut or a closed tab
 * does not lose it (PRD §9.8.4). A draft is not a record: it never syncs, is
 * never validated against the contract and needs no permission — it is the
 * typing itself, held in the encrypted local database until Review & Save
 * turns it into a locked entry, or it is thrown away.
 *
 * Drafts belong to the person typing. On a shared phone the next person on
 * shift must not see a half-written note, and must not save it under their
 * own name; it waits for its author's next sign-in.
 */
export type DraftOwner = {
  staffId: string;
  patientId: string;
  /** The encounter's id, or `new` before its first step is saved. */
  encounterKey: string;
};

export type StoredDraft = { step: string; data: unknown; updatedOn: string };

type DraftRow = { id: string; step: string; data: string; updatedOn: string };

const idOf = (owner: DraftOwner, step: string) => [owner.staffId, owner.patientId, owner.encounterKey, step].join('|');

const OWNER_MATCH = `"staffId" = ? AND "patientId" = ? AND "encounterKey" = ?`;
const ownerValues = (owner: DraftOwner) => [owner.staffId, owner.patientId, owner.encounterKey];

export const readDrafts = async (owner: DraftOwner): Promise<StoredDraft[]> => {
  const rows = await getDatabase().getAll<DraftRow>(
    `SELECT "id", "step", "data", "updatedOn" FROM ${DRAFTS_TABLE} WHERE ${OWNER_MATCH}`,
    ownerValues(owner),
  );
  return rows.flatMap((row) => {
    try {
      return [{ step: row.step, data: JSON.parse(row.data) as unknown, updatedOn: row.updatedOn }];
    } catch (cause) {
      // A draft that no longer parses is dropped from view, never allowed to break the encounter screen.
      console.warn(`draft ${row.id} could not be read`, cause);
      return [];
    }
  });
};

export const writeDraft = async (owner: DraftOwner, step: string, data: unknown): Promise<void> => {
  const id = idOf(owner, step);
  const db = getDatabase();
  const json = JSON.stringify(data);
  const updatedOn = nowIso();
  if (await db.getOptional(`SELECT "id" FROM ${DRAFTS_TABLE} WHERE "id" = ?`, [id])) {
    await db.execute(`UPDATE ${DRAFTS_TABLE} SET "data" = ?, "updatedOn" = ? WHERE "id" = ?`, [json, updatedOn, id]);
  } else {
    await db.execute(
      `INSERT INTO ${DRAFTS_TABLE} ("id", "staffId", "patientId", "encounterKey", "step", "data", "updatedOn") VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, owner.staffId, owner.patientId, owner.encounterKey, step, json, updatedOn],
    );
  }
};

export const discardDraft = (owner: DraftOwner, step: string) =>
  getDatabase().execute(`DELETE FROM ${DRAFTS_TABLE} WHERE "id" = ?`, [idOf(owner, step)]);

/** Every draft for an encounter — once it closes, nothing typed for it can still be saved. */
export const discardDrafts = (owner: DraftOwner) =>
  getDatabase().execute(`DELETE FROM ${DRAFTS_TABLE} WHERE ${OWNER_MATCH}`, ownerValues(owner));
