import { useCallback } from 'react';
import { useLiveQuery, type LiveQuery } from '@/data';
import { closingEntries, encountersForPatient, entriesForEncounter, listEncounters } from '@/data/repos/encounters';
import { summariseEncounter, type EncounterSummary } from './encounterSummary';

/** How many finished encounters the hub lists; older ones live on each patient's profile. */
const RECENTLY_CLOSED = 20;

const newestFirst = (a: EncounterSummary, b: EncounterSummary) => b.openedOn.localeCompare(a.openedOn);

/** Every open encounter anyone on shift can pick up, and the most recently finished. */
export const useEncounterList = (): LiveQuery<{ open: EncounterSummary[]; closed: EncounterSummary[] }> => {
  const load = useCallback(async () => {
    const [encounters, closing] = await Promise.all([listEncounters(), closingEntries()]);
    const closedIds = new Set(closing.map((entry) => entry.encounterId));
    const open = encounters.filter((encounter) => !closedIds.has(encounter.id));
    const closed = encounters
      .filter((encounter) => closedIds.has(encounter.id))
      .sort((a, b) => b.openedOn.localeCompare(a.openedOn))
      .slice(0, RECENTLY_CLOSED);
    const summaries = await Promise.all(
      [...open, ...closed].map(async (encounter) => summariseEncounter(encounter, await entriesForEncounter(encounter.id))),
    );
    return {
      open: summaries.filter((summary) => summary.status === 'Open').sort(newestFirst),
      closed: summaries.filter((summary) => summary.status !== 'Open').sort(newestFirst),
    };
  }, []);
  return useLiveQuery(load);
};

/** One patient's encounters, newest first — their history on the profile (PRD §9.8.1, step 7). */
export const usePatientEncounters = (patientId: string): LiveQuery<EncounterSummary[]> => {
  const load = useCallback(async () => {
    const encounters = await encountersForPatient(patientId);
    const summaries = await Promise.all(
      encounters.map(async (encounter) => summariseEncounter(encounter, await entriesForEncounter(encounter.id))),
    );
    return summaries.sort(newestFirst);
  }, [patientId]);
  return useLiveQuery(load);
};
