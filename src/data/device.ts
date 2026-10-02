const STORAGE_KEY = 'geneus.deviceId';

/**
 * Identifies the phone a document was written on, which is what makes a sync
 * conflict inspectable later (SCHEMA.md §2). Enrollment will replace this with
 * a server-issued identity (root §4.3c).
 */
export const deviceId = (): string => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  const minted = crypto.randomUUID?.() ?? `device-${Date.now()}`;
  localStorage.setItem(STORAGE_KEY, minted);
  return minted;
};
