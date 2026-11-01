import { useCallback } from 'react';
import { useLiveQuery, type LiveQuery } from '@/data';
import { encountersForPatient, entriesAtSteps, entriesForEncounter, listEncounters, listEncounterEntries } from '@/data/repos/encounters';
import { summariseEncounter, type EncounterSummary } from './encounterSummary';
import { QUEUE_STEPS, stationQueues, type QueuedPatient, type StationQueue } from './stationQueues';
import { patientIdentityIds } from '@/data/repos/patientIdentity';

const newestFirst = (a: EncounterSummary, b: EncounterSummary) => b.openedOn.localeCompare(a.openedOn);

/** Every open encounter anyone on shift can pick up, and the most recently finished. */
export const useEncounterList = (enabled=true): LiveQuery<{ open: EncounterSummary[]; closed: EncounterSummary[] }> => {
  const load = useCallback(async () => {
    if(!enabled)return {open:[],closed:[]};
    const [encounters, entries] = await Promise.all([listEncounters(), listEncounterEntries()]);
    const byEncounter = new Map<string, typeof entries>();
    for (const entry of entries) { const group = byEncounter.get(entry.encounterId) ?? []; group.push(entry); byEncounter.set(entry.encounterId, group); }
    const summaries = encounters.map((encounter) => summariseEncounter(encounter, byEncounter.get(encounter.id) ?? []));
    return {
      open: summaries.filter((summary) => summary.status === 'Open').sort(newestFirst),
      closed: summaries.filter((summary) => summary.status !== 'Open').sort(newestFirst),
    };
  }, [enabled]);
  return useLiveQuery(load);
};

/** One patient's encounters, newest first — their history on the profile (PRD §9.8.1, step 7). */
export const usePatientEncounters = (patientId: string): LiveQuery<EncounterSummary[]> => {
  const load = useCallback(async () => {
    const encounters = (await Promise.all((await patientIdentityIds(patientId)).map(encountersForPatient))).flat();
    const summaries = await Promise.all(
      encounters.map(async (encounter) => summariseEncounter(encounter, await entriesForEncounter(encounter.id))),
    );
    return summaries.sort(newestFirst);
  }, [patientId]);
  return useLiveQuery(load);
};

/** The lab, results-ready and pharmacy queues, kept current as steps are saved on any device. */
export const useStationQueues = (): LiveQuery<Record<StationQueue, QueuedPatient[]>> =>
  useLiveQuery(useCallback(async () => stationQueues(await entriesAtSteps(QUEUE_STEPS)), []));
