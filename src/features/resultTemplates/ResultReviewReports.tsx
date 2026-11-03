import { useCallback } from 'react';
import { ENCOUNTER_STEP_VALUES, type EncounterEntry, type Patient, type Staff } from '@shared';
import { useLiveQuery } from '@/data';
import { allOfType, allWhere, findRecord } from '@/data/db';
import { PublishedLabReport, effectiveLabReport } from './PublishedLabReport';

/**
 * The results a clinician is about to acknowledge, read-only and laid out as the
 * laboratory published them, flags included. A result without a structured
 * report shows its recorded text.
 */
export const ResultReviewReports = ({ patientId, entryIds }: { patientId: string; entryIds: readonly string[] }) => {
  const data = useLiveQuery(useCallback(async () => {
    const [entries, patient, staff] = await Promise.all([allWhere<EncounterEntry>('encounter_entry', 'patientId', patientId), findRecord<Patient>('patient', patientId), allOfType<Staff>('staff')]);
    return { entries, patient, names: new Map(staff.map((member) => [member.staffId, member.fullName])) };
  }, [patientId]));
  if (!data.data) return <p role="status">Reading results…</p>;
  const { entries, patient, names } = data.data;
  const results = entryIds.flatMap((id) => entries.filter((entry) => entry.id === id));
  if (!results.length) return <p className="text-sm text-ink-soft">No results are waiting for review.</p>;
  return <div className="space-y-5">{results.map((entry) => effectiveLabReport(entry, entries)
    ? <PublishedLabReport key={entry.id} entry={entry} entries={entries} heading={`Laboratory report · ${patient?.fullName ?? patientId} · ${patientId}`} enteredBy={names.get(entry.createdBy)} />
    : <dl key={entry.id} className="space-y-2 rounded-card border border-outline-soft p-4 text-sm">{ENCOUNTER_STEP_VALUES.lab_results.parse(entry.values).results.map((row) => <div key={row.orderItemId ?? row.test}><dt className="font-bold">{row.test}</dt><dd className="whitespace-pre-wrap">{row.result}</dd></div>)}</dl>)}</div>;
};
