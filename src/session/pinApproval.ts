/**
 * Who may set a PIN on this device right now (SCHEMA.md §10). Setting one is
 * never open to whoever is holding the phone: it takes an approval, granted by
 * one of these —
 *
 *   - signing in with their email and password on this device,
 *   - accepting an invitation emailed to them,
 *   - the right old 4-digit PIN, when replacing it with a 6-digit one,
 *   - registering the facility, for its first admin, because nobody else
 *     exists yet to approve them.
 *
 * Held in memory only, so an approval lasts as long as the page and is spent by
 * the PIN it allows; a reload means asking again.
 * Reusing the first administrator's existing PIN during additional-facility
 * registration is handled separately in facilityIdentity.ts. It does not grant
 * approval to choose or reset another facility membership's PIN.
 */
const approved = new Set<string>();

export const approvePinSetup = (staffId: string): void => {
  approved.add(staffId);
};

export const isPinSetupApproved = (staffId: string): boolean => approved.has(staffId);

/** Spends the approval. Returns false when there was none, and nothing should be stored. */
export const takePinSetupApproval = (staffId: string): boolean => approved.delete(staffId);
