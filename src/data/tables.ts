import type { DocType } from '@shared';

export const REGISTER_DRAFTS_TABLE = 'register_builder_drafts';
export const WORKFORCE_DRAFTS_TABLE = 'workforce_editor_drafts';
export const WORKFORCE_RECEIPTS_TABLE = 'workforce_upload_receipts';
export const CLINICAL_REVIEWS_TABLE = 'clinical_review_drafts';

/**
 * Record type ↔ table name. Table names match the Sync Streams (and the
 * server's tables) so PowerSync can route downloaded rows and name uploaded
 * ones. Kept apart from schema.ts so the modules that only need a name do not
 * pull the PowerSync client into the initial bundle.
 */
export const TABLE_FOR: Record<DocType, string> = {
  patient: 'patients',
  patient_identity_event: 'patient_identity_events',
  visit: 'visits',
  encounter: 'encounters',
  encounter_entry: 'encounter_entries',
  clinical_event: 'clinical_events',
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
  fee_item: 'fee_items',
  charge: 'charges',
  payment: 'payments',
  billing_adjustment: 'billing_adjustments',
  incoming_transfer: 'incoming_transfers',
  billing_department: 'billing_departments',
  location: 'locations',
  service_definition: 'service_definitions',
  service_offering: 'service_offerings',
  practitioner_profile: 'practitioner_profiles',
  credential: 'credentials',
  capability_decision: 'capability_decisions',
  reviewer_delegation: 'reviewer_delegations',
  clinical_authority_bootstrap: 'clinical_authority_bootstraps',
  external_clinical_reviewer: 'external_clinical_reviewers',
  authority_snapshot: 'authority_snapshots',
  staff_assignment: 'staff_assignments',
  service_session: 'service_sessions',
  session_event: 'session_events',
  work_ownership_event: 'work_ownership_events',
  appointment_reservation: 'appointment_reservations',
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
