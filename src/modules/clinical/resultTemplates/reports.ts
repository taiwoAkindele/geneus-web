import { hasCriticalFlag, type EncounterEntry, type LabReport } from '@shared';

/**
 * The structured report a lab result currently stands on: its latest correction's
 * report, else its own. A correction made without one (from an older device)
 * means only the plain summary is current.
 */
export const effectiveLabReport = (entry: EncounterEntry, entries: readonly EncounterEntry[]): LabReport | undefined => {
  const corrections = entries.filter((e) => e.step === 'amendment' && e.amends === entry.id && e.values.correctedValues);
  const replaced = new Set(corrections.map((e) => e.values.previousAmendmentId));
  const latest = corrections.find((e) => !replaced.has(e.id));
  return latest ? latest.labReport : entry.labReport;
};

/** The scientist flagged a value in this result as critically high or low. */
export const isCriticalResult = (entry: EncounterEntry, entries: readonly EncounterEntry[]) => hasCriticalFlag(effectiveLabReport(entry, entries));
