/**
 * Who may set a PIN on this device right now (SCHEMA.md §10). Setting one is
 * never open to whoever is holding the phone: it takes an approval, granted by
 * one of three things —
 *
 *   - a PIN setup code an admin issued for that person (from anywhere),
 *   - an admin or supervisor on site entering their own PIN here,
 *   - registering the facility, for its first admin, because nobody else
 *     exists yet to approve them.
 *
 * Held in memory only, so an approval lasts as long as the page and is spent by
 * the PIN it allows; a reload means asking again.
 */
const approved = new Set<string>();

export const approvePinSetup = (staffId: string): void => {
  approved.add(staffId);
};

export const isPinSetupApproved = (staffId: string): boolean => approved.has(staffId);

/** Spends the approval. Returns false when there was none, and nothing should be stored. */
export const takePinSetupApproval = (staffId: string): boolean => approved.delete(staffId);
