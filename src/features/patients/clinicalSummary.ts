import { CLINICAL_VALUES, canReadPatientChart, currentAllergies, currentClinicalEvents, type AuthorizationContext, type ClinicalEvent } from '@shared';
import { listClinicalEvents } from '@/data/repos/clinical';
import { listEncounterEntries, listEncounters } from '@/data/repos/encounters';
import type { PatientDirectoryRow } from '@/data/repos/patientDirectory';
import { summariseEncounter, type EncounterSummary } from '@/features/encounter/encounterSummary';
import { calendarDate } from '@/lib/calendarDate';

export type ClinicalStatus = 'admitted' | 'in_progress' | 'unfinished' | 'not_admitted';
export type PatientClinicalSummary = {
  allergies: { allergen: string; severity: 'unknown' | 'mild' | 'moderate' | 'severe' }[];
  problems: string[];
  status: ClinicalStatus;
  /** The open visit behind an in-progress or unfinished status. */
  openVisit?: EncounterSummary;
};

const SEVERITY = { severe: 0, moderate: 1, mild: 2, unknown: 3 } as const;

/**
 * Pure projection for the clinical Patients table, keyed by directory row patient
 * record id. An open visit started today is in progress; one started earlier was
 * left unfinished.
 */
export const summariseClinicalRows = (rows: readonly PatientDirectoryRow[], events: readonly ClinicalEvent[], visits: readonly EncounterSummary[], today: string): Map<string, PatientClinicalSummary> => {
  const current = currentClinicalEvents(events);
  return new Map(rows.map((row) => {
    const ids = new Set(row.ids);
    const own = current.filter((event) => ids.has(event.patientId));
    const allergies = currentAllergies(own, row.searchRecords)
      .map(({ allergen, severity }) => ({ allergen, severity }))
      .sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity] || a.allergen.localeCompare(b.allergen));
    const problems = own.filter((event) => event.kind === 'problem').flatMap((event) => {
      const parsed = CLINICAL_VALUES.problem.safeParse(event.values);
      return parsed.success && parsed.data.status === 'active' ? [parsed.data.label] : [];
    });
    const openVisit = visits.filter((visit) => ids.has(visit.patientId) && visit.status === 'Open').sort((a, b) => b.openedOn.localeCompare(a.openedOn))[0];
    const status: ClinicalStatus = row.stay ? 'admitted' : openVisit ? calendarDate(openVisit.openedOn) === today ? 'in_progress' : 'unfinished' : 'not_admitted';
    return [row.patient.id, { allergies, problems, status, ...(openVisit && !row.stay ? { openVisit } : {}) }];
  }));
};

/** Allergies, active problems and visit status for every listed patient; medical-history access only. */
export const loadPatientClinicalSummaries = async (context: AuthorizationContext, rows: readonly PatientDirectoryRow[]) => {
  if (!canReadPatientChart(context)) throw new Error('Permission to view medical history is required');
  const [events, encounters, entries] = await Promise.all([listClinicalEvents(), listEncounters(), listEncounterEntries()]);
  const byEncounter = new Map<string, typeof entries>();
  for (const entry of entries) { const group = byEncounter.get(entry.encounterId) ?? []; group.push(entry); byEncounter.set(entry.encounterId, group); }
  const visits = encounters.filter((encounter) => encounter.facilityId === context.facilityId).map((encounter) => summariseEncounter(encounter, byEncounter.get(encounter.id) ?? []));
  return summariseClinicalRows(rows, events.filter((event) => event.facilityId === context.facilityId), visits, calendarDate());
};
