import type { DocType } from '@shared';

/**
 * Record type ↔ table name. Table names match the Sync Streams (and the
 * server's tables) so PowerSync can route downloaded rows and name uploaded
 * ones. Kept apart from schema.ts so the modules that only need a name do not
 * pull the PowerSync client into the initial bundle.
 */
export const TABLE_FOR: Record<DocType, string> = {
  patient: 'patients',
  visit: 'visits',
  encounter: 'encounters',
  encounter_entry: 'encounter_entries',
  handoff: 'handoffs',
  appointment: 'appointments',
  register_definition: 'register_definitions',
  register_entry: 'register_entries',
  referral: 'referrals',
  stock_item: 'stock_items',
  stock_movement: 'stock_movements',
  facility: 'facilities',
  unit: 'units',
  staff: 'staff',
  roster_shift: 'roster_shifts',
  device: 'devices',
  audit_event: 'audit_events',
  sync_rejection: 'sync_rejections',
  pin_setup_code: 'pin_setup_codes',
};

/**
 * Unsaved encounter work (PRD §9.8.4). Local-only: never uploaded, never a
 * record, not in the contract — it exists so a power cut does not lose ten
 * minutes of typing, and lives inside the encrypted database with the rest.
 */
export const DRAFTS_TABLE = 'encounter_drafts';

export const TYPE_FOR: Record<string, DocType> = Object.fromEntries(
  Object.entries(TABLE_FOR).map(([type, table]) => [table, type as DocType]),
) as Record<string, DocType>;

export const ALL_TABLES: readonly string[] = Object.values(TABLE_FOR);
