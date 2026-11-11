import type { ReactNode } from 'react';
import { currentAllergies, effectiveEncounterEntries, outstandingResults, type ClinicalKind, type EncounterEntry } from '@shared';
import { Button, Tag } from '@/ui';
import { calendarDate } from '@/lib/calendarDate';
import type { PatientClinicalRecord } from '@/data/repos/clinical';
import type { BookedAppointment } from '@/modules/front-desk/appointments';
import type { EncounterSummary } from '@/modules/clinical/encounter';
import { visitDate } from '@/modules/clinical/encounter/VisitTable';
import { entryRows } from '@/modules/clinical/encounter/visitContent';
import { EMPTY_ENCOUNTER_DATA, projectEncounter } from '@/modules/clinical/encounter/encounterRecord';
import { observationHistory } from '@/modules/clinical/clinical/clinicalSummary';
import { clinicalTitle } from '@/modules/clinical/clinical/ClinicalRecordCard';
import { PublishedLabReport, effectiveLabReport } from '@/modules/clinical/resultTemplates/PublishedLabReport';
import { isCriticalResult } from '@/modules/clinical/resultTemplates/reports';
import { WardCareWorkspace } from '@/modules/clinical/inpatient/WardCareWorkspace';
import { PatientIdentityPanel } from './PatientIdentityPanel';
import type { HistoryView } from './patientRoutes';

const time = (at: string) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const Panel = ({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) => <section className="border-t border-outline-soft py-4">
  <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h3 className="text-[17px] font-extrabold">{title}</h3>{action}</div>{children}
</section>;
const TextAction = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => <button type="button" onClick={onClick} className="min-h-[44px] text-sm font-bold text-brand hover:underline">{children}</button>;
const Muted = ({ children }: { children: ReactNode }) => <p className="text-sm leading-relaxed text-ink-soft">{children}</p>;

type Result = { entry: EncounterEntry; encounterId: string; critical: boolean; unreviewed: boolean };

/** Results recorded today, plus any earlier result still waiting for clinical review. */
export const currentResults = (chart: PatientClinicalRecord, today = calendarDate()): Result[] => {
  const byEncounter = new Map<string, EncounterEntry[]>();
  for (const entry of chart.entries) byEncounter.set(entry.encounterId, [...(byEncounter.get(entry.encounterId) ?? []), entry]);
  const results: Result[] = [];
  for (const [encounterId, raw] of byEncounter) {
    const effective = effectiveEncounterEntries(raw);
    const unreviewed = new Set(outstandingResults(effective).unreviewed);
    for (const entry of effective.filter((candidate) => candidate.step === 'lab_results')) {
      const pending = unreviewed.has(entry.id);
      if (pending || calendarDate(entry.createdOn) === today) results.push({ entry, encounterId, critical: isCriticalResult(entry, raw), unreviewed: pending });
    }
  }
  return results.sort((a, b) => Number(b.critical) - Number(a.critical) || b.entry.createdOn.localeCompare(a.entry.createdOn));
};

type Props = {
  patientId: string; chart?: PatientClinicalRecord; chartUnavailable?: ReactNode;
  admission?: ReactNode; openVisits: EncounterSummary[]; history: EncounterSummary[]; appointments: BookedAppointment[];
  canRecord: boolean; onVisit: (id: string, continueVisit?: boolean) => void; onHistory: (view: HistoryView) => void; onClinical: (kind: ClinicalKind) => void;
};

/**
 * The patient as they are now: the current stay or visit, what has been
 * recorded today, results waiting for review and what is still outstanding,
 * then the standing summary. Older care is in History.
 */
export const PatientNow = ({ patientId, chart, chartUnavailable, admission, openVisits, history, appointments, canRecord, onVisit, onHistory, onClinical }: Props) => {
  if (admission) return <div><h2 className="sr-only">Now</h2>{admission}<WardCareWorkspace patientId={patientId} />{chart ? <Summary patientId={patientId} chart={chart} history={history} appointments={appointments} onHistory={onHistory} onClinical={onClinical} onVisit={onVisit} /> : null}</div>;
  if (!chart) return <>{chartUnavailable}</>;
  const today = calendarDate();
  const observations = observationHistory(chart.entries).filter((reading) => calendarDate(reading.recordedOn) === today);
  const latest = observations[0];
  const results = currentResults(chart, today);
  const critical = results.filter((result) => result.critical && result.unreviewed);
  const notes = effectiveEncounterEntries(chart.entries).filter((entry) => entry.step === 'complaint' && calendarDate(entry.createdOn) === today).reverse();
  const pending = openVisits.flatMap((visit) => outstandingResults(effectiveEncounterEntries(chart.entries.filter((entry) => entry.encounterId === visit.id))).pending.map((test) => ({ test, visit })));
  const projected = (encounterId: string) => {
    const encounter = chart.encounters.find((candidate) => candidate.id === encounterId);
    return encounter ? projectEncounter({ patientId, encounter, entries: chart.entries.filter((entry) => entry.encounterId === encounterId), draft: EMPTY_ENCOUNTER_DATA, skippedNow: [], staffNames: chart.staffNames }).data : EMPTY_ENCOUNTER_DATA;
  };
  const author = (entry: EncounterEntry) => chart.staffNames.get(entry.createdBy) ?? entry.createdBy;
  const nothingToday = !latest && !results.length && !notes.length && !pending.length;
  return <div>
    <h2 className="sr-only">Now</h2>
    {critical.length ? <section role="alert" aria-label="Critical results" className="mb-5 rounded-field border-2 border-danger bg-danger-bg p-4">
      <p className="font-extrabold text-danger-strong">Critical result{critical.length === 1 ? '' : 's'} not yet reviewed</p>
      <p className="mt-1 text-sm text-danger-strong">{critical.map((result) => (result.entry.values.results as { test: string }[]).map((item) => item.test).join(', ')).join(' · ')}</p>
      {canRecord ? <Button fullWidth={false} className="mt-3" onClick={() => onVisit(critical[0].encounterId, true)}>Review in visit</Button> : null}
    </section> : null}

    {openVisits.length ? <section aria-label="Visits in progress" className="mb-5 space-y-3">
      {openVisits.length > 1 ? <p className="text-sm font-bold text-amber-text">{openVisits.length} visits are open for this patient. Continue the right one.</p> : null}
      {openVisits.map((visit) => <div key={visit.id} className="flex flex-wrap items-center justify-between gap-3 rounded-field border border-outline-soft bg-brand-wash p-4">
        <div><p className="font-bold">Visit in progress · {visitDate(visit.openedOn)}</p><p className="mt-1 text-sm">{visit.title} · Next: {visit.nextAction}</p></div>
        {openVisits.length > 1 ? <Button variant="outlined" fullWidth={false} onClick={() => onVisit(visit.id, canRecord)}>{canRecord ? 'Continue this visit' : 'View visit'}</Button> : null}
      </div>)}
    </section> : null}

    <section aria-labelledby="now-today">
      <h3 id="now-today" className="text-[22px] font-extrabold">Today</h3>
      <p className="mt-1 text-sm text-ink-soft">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · results still waiting for review are included</p>
      {nothingToday ? <p className="mt-3 rounded-field border border-dashed border-outline p-4 text-sm text-ink-soft">Nothing recorded today yet, and no results are waiting for review.</p> : null}

      {latest ? <Panel title="Observations" action={<span className="text-xs text-ink-muted">{time(latest.recordedOn)} · {chart.staffNames.get(chart.entries.find((entry) => entry.id === latest.id)?.createdBy ?? '') ?? ''}</span>}>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">{([
          ['Temperature', latest.temperatureC === undefined ? undefined : `${latest.temperatureC} °C`],
          ['Blood pressure', latest.systolicMmHg || latest.diastolicMmHg ? `${latest.systolicMmHg ?? '—'}/${latest.diastolicMmHg ?? '—'} mmHg` : undefined],
          ['Pulse', latest.pulseBpm === undefined ? undefined : `${latest.pulseBpm}/min`],
          ['SpO₂', latest.spo2Percent === undefined ? undefined : `${latest.spo2Percent}%`],
          ['Respiratory rate', latest.respiratoryRate === undefined ? undefined : `${latest.respiratoryRate}/min`],
          ['Weight', latest.weightKg === undefined ? undefined : `${latest.weightKg} kg`],
        ] as const).filter(([, value]) => value !== undefined).map(([label, value]) => <div key={label}><dt className="text-ink-soft">{label}</dt><dd className="mt-0.5 text-base font-bold">{value}</dd></div>)}</dl>
        {observations.length > 1 ? <p className="mt-2 text-xs text-ink-muted">{observations.length} sets recorded today; latest shown.</p> : null}
      </Panel> : null}

      {results.length ? <Panel title="Results">
        <div className="space-y-4">{results.map((result) => {
          const report = effectiveLabReport(result.entry, chart.entries);
          return <article key={result.entry.id} className={`rounded-field border p-3 ${result.critical ? 'border-danger' : 'border-outline-soft'}`}>
            <div className="mb-2 flex flex-wrap items-center gap-2">{result.critical ? <Tag tone="danger">Critical</Tag> : null}{result.unreviewed ? <Tag tone="amber">Not yet reviewed</Tag> : <Tag tone="green">Reviewed</Tag>}<span className="text-xs text-ink-muted">{visitDate(result.entry.createdOn)} · {author(result.entry)}</span></div>
            {report ? <PublishedLabReport entry={result.entry} entries={chart.entries} heading={`Laboratory report · ${result.entry.patientId}`} enteredBy={author(result.entry)} />
              : <dl className="space-y-1 text-sm">{entryRows(result.entry, projected(result.encounterId)).filter((row) => row.value !== '—').map((row) => <div key={row.label}><dt className="font-semibold text-ink-soft">{row.label}</dt><dd className="whitespace-pre-wrap">{row.value}</dd></div>)}</dl>}
            {result.unreviewed && canRecord ? <TextAction onClick={() => onVisit(result.encounterId, true)}>Review in visit</TextAction> : null}
          </article>;
        })}</div>
      </Panel> : null}

      {pending.length ? <Panel title="Waiting for the laboratory">
        <ul className="space-y-1 text-sm">{pending.map(({ test, visit }) => <li key={visit.id + test}><b>{test}</b> <span className="text-ink-soft">· ordered {visitDate(visit.openedOn)}</span></li>)}</ul>
      </Panel> : null}

      {notes.length ? <Panel title="Notes">
        <div className="space-y-3">{notes.map((entry) => <div key={entry.id} className="text-sm">{entryRows(entry).filter((row) => row.value !== '—').map((row) => <p key={row.label}><b>{row.label}:</b> <span className="whitespace-pre-wrap">{row.value}</span></p>)}<p className="mt-1 text-xs text-ink-muted">{time(entry.createdOn)} · {author(entry)}</p></div>)}</div>
      </Panel> : null}
    </section>

    <Summary patientId={patientId} chart={chart} history={history} appointments={appointments} onHistory={onHistory} onClinical={onClinical} onVisit={onVisit} />
  </div>;
};

/** The standing picture: problems, medicines, allergies, last visit and next booking. */
const Summary = ({ patientId, chart, history, appointments, onHistory, onClinical, onVisit }: { patientId: string; chart: PatientClinicalRecord; history: EncounterSummary[]; appointments: BookedAppointment[]; onHistory: (view: HistoryView) => void; onClinical: (kind: ClinicalKind) => void; onVisit: (id: string) => void }) => {
  const problems = chart.current.filter((event) => event.kind === 'problem' && event.values.status !== 'resolved');
  const medicines = chart.current.filter((event) => event.kind === 'medication' && event.values.status === 'active');
  const allergies = currentAllergies(chart.events, chart.patients);
  const last = history.find((visit) => visit.status !== 'Open');
  const next = appointments.filter((appointment) => appointment.group !== 'completed' && appointment.group !== 'cancelled' && appointment.at >= new Date().toISOString()).sort((a, b) => a.at.localeCompare(b.at))[0];
  return <section aria-labelledby="now-summary" className="mt-8">
    <h3 id="now-summary" className="text-[22px] font-extrabold">Summary</h3>
    <div className="grid gap-x-8 lg:grid-cols-2">
      <Panel title="Problems" action={<TextAction onClick={() => onClinical('problem')}>Review problems</TextAction>}>
        {problems.length ? <ul className="space-y-1 text-sm">{problems.map((event) => <li key={event.id}><b>{clinicalTitle(event)}</b> <span className="text-ink-soft">· {String(event.values.status)}</span></li>)}</ul> : <Muted>No ongoing problems recorded.</Muted>}
      </Panel>
      <Panel title="Current medicines" action={<TextAction onClick={() => onClinical('medication')}>Review medicines</TextAction>}>
        {medicines.length ? <ul className="space-y-1 text-sm">{medicines.map((event) => <li key={event.id}><b>{clinicalTitle(event)}</b> <span className="text-ink-soft">{[event.values.dose, event.values.frequency].filter(Boolean).join(' · ')}</span></li>)}</ul> : <Muted>No active medicines confirmed.</Muted>}
      </Panel>
      <Panel title="Allergies" action={<TextAction onClick={() => onClinical('allergy')}>Review allergies</TextAction>}>
        {allergies.length ? <ul className="space-y-1 text-sm">{allergies.map((allergy, index) => <li key={`${allergy.allergen}-${index}`}><b className="text-danger-strong">{allergy.allergen}</b> <span className="text-ink-soft">· {allergy.reaction} · {allergy.verification}</span></li>)}</ul> : <Muted>No allergies recorded. Allergy status still needs clinical review.</Muted>}
      </Panel>
      <Panel title="Last visit and next booking" action={<TextAction onClick={() => onHistory('visits')}>All visits</TextAction>}>
        <div className="space-y-1 text-sm">{last ? <p><b>Last visit:</b> {visitDate(last.openedOn)} · {last.title} <button type="button" className="min-h-[36px] font-bold text-brand hover:underline" onClick={() => onVisit(last.id)}>View</button></p> : <Muted>No completed visits.</Muted>}
          {next ? <p><b>Next booking:</b> {next.when ?? visitDate(next.at)} · {next.reason}</p> : <Muted>No upcoming booking.</Muted>}</div>
      </Panel>
    </div>
    <PatientIdentityPanel patientId={patientId} />
  </section>;
};
