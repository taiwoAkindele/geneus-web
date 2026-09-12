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
};

export const TYPE_FOR: Record<string, DocType> = Object.fromEntries(
  Object.entries(TABLE_FOR).map(([type, table]) => [table, type as DocType]),
) as Record<string, DocType>;

export const ALL_TABLES: readonly string[] = Object.values(TABLE_FOR);
