import { stationQueues } from '@/features/encounter/stationQueues';
import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { conflictingCorrections, effectiveEncounterEntries, type Encounter, type EncounterEntry, type Patient } from '@shared';
import { amendEntry } from '@/data/repos/encounters';
import { useAuthorizationContext, useSession } from '@/session';
import { Button, SelectField, Sheet, SheetCancelButton, TextAreaField, useToast } from '@/ui';
import { projectEncounter, EMPTY_ENCOUNTER_DATA } from '@/features/encounter/encounterRecord';
import { STEP_DEFS } from '@/features/encounter/steps';
import { entryRows } from '@/features/encounter/visitContent';
import { summariseEncounter, type EncounterSummary } from '@/features/encounter/encounterSummary';
import { visitDate, visitStatusLabel as consultationStatusLabel } from '@/features/encounter/VisitTable';
import { EntryEditorSheet } from '@/features/encounter/components/EntryEditorSheet';
import type { StepKey } from '@/features/encounter';

const GROUPS: Record<string, { label: string; steps?: string[] }> = { summary: { label: 'Summary' }, vitals: { label: 'Vitals', steps: ['vitals'] }, consultation: { label: 'Consultation', steps: ['complaint'] }, investigations: { label: 'Investigations', steps: ['investigation_review', 'lab_order', 'lab_results', 'result_review'] }, treatment: { label: 'Diagnosis & treatment', steps: ['diagnosis', 'prescription', 'injection_order', 'injection', 'dispense', 'admission'] }, disposition: { label: 'Disposition & care plan', steps: ['disposition'] }, follow_up: { label: 'Follow-up', steps: ['follow_up'] } };

export const VisitRecord = ({ patient, encounter, entries, staffNames, canRecord, onBack, onContinue, onRefresh, onAppointments, summary }: { patient: Patient; encounter: Encounter; entries: EncounterEntry[]; staffNames: Map<string, string>; canRecord: boolean; onBack: () => void; onContinue: () => void; onRefresh: () => void; onAppointments: () => void; summary?: EncounterSummary }) => {
  const [params, setParams] = useSearchParams();
  const context = useAuthorizationContext();
  const { user, facility } = useSession();
  const toast = useToast();
  const [targetId, setTargetId] = useState('');
  const [note, setNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<EncounterEntry>();
  const printContent = useRef<HTMLDivElement>(null);
  const card = summary ?? summariseEncounter(encounter, entries);
  const visitStatusLabel = (status: EncounterSummary['status']) => card.admissionStatus
    ? `${card.careType === 'inpatient' ? 'Inpatient · ' : card.careType === 'past_inpatient' ? 'Hospital stay · ' : ''}${card.admissionStatus}`
    : consultationStatusLabel(status);
  const state = projectEncounter({ patientId: encounter.patientId, encounter, entries, draft: EMPTY_ENCOUNTER_DATA, skippedNow: [], staffNames });
  const stepOrder = ['vitals', 'complaint', 'lab_order', 'lab_results', 'diagnosis', 'injection', 'dispense', 'admission', 'follow_up'];
  const saved = effectiveEncounterEntries(entries).sort((a, b) => stepOrder.indexOf(a.step) - stepOrder.indexOf(b.step) || a.createdOn.localeCompare(b.createdOn) || a.id.localeCompare(b.id));
  const target = entries.find((entry) => entry.id === targetId && entry.step !== 'amendment');
  const panel = params.get('panel');
  const selectedGroup = Object.keys(GROUPS).includes(params.get('visitSection') ?? '') ? params.get('visitSection')! : 'summary';
  const group = GROUPS[selectedGroup] ?? GROUPS.summary;
  const visible = group.steps ? saved.filter((entry) => group.steps?.includes(entry.step)) : saved;
  const author = (entry: EncounterEntry) => staffNames.get(entry.createdBy) ?? entry.createdBy;
  const showPanel = (value?: string) => { setError(''); setParams((current) => { const next = new URLSearchParams(current); if (value) next.set('panel', value); else next.delete('panel'); return next; }); };
  const addAmendment = (entry: EncounterEntry) => { setTargetId(entry.id); setNote(''); setReviewing(false); showPanel('amend'); };
  const save = async () => {
    if (!target || !note.trim() || busy.current || !canRecord) return;
    busy.current = true; setSaving(true); setError('');
    try { await amendEntry(target, note, context); toast('Amendment signed and saved on this device'); setNote(''); setReviewing(false); showPanel(); onRefresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Your amendment is still here.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const print = () => {
    const popup = window.open('', '_blank', 'width=900,height=700');
    if (!popup || !printContent.current) { setError('Allow the print window, then try again.'); return; }
    popup.opener = null; popup.document.title = 'Geneus visit summary';
    const style = popup.document.createElement('style'); style.textContent = 'body{font:14px system-ui,sans-serif;color:#111;margin:24px}h1{font-size:24px}h2{font-size:18px}section{break-inside:avoid;border-top:1px solid #ccc;padding:12px 0}dl>div{margin:6px 0}dt{font-weight:600}dd{margin:2px 0;white-space:pre-wrap}p{white-space:pre-wrap;overflow-wrap:anywhere}button{display:none}';
    popup.document.head.append(style); popup.document.body.append(printContent.current.cloneNode(true)); popup.focus(); popup.print();
  };
  const entryBody = (entry: EncounterEntry, interactive: boolean) => {
    const amendments = entries.filter((candidate) => candidate.step === 'amendment' && candidate.amends === entry.id);
    const original = entries.find((candidate) => candidate.id === entry.id);
    return <section key={entry.id} className="mb-3 break-inside-avoid overflow-hidden rounded-field border border-outline-soft px-4 pb-3">
      <div className="-mx-4 flex flex-wrap justify-between gap-2 border-b border-outline-soft bg-brand-wash px-4 py-3"><h3 className="text-lg font-bold">{STEP_DEFS[entry.step as StepKey]?.title}</h3><p className="text-xs text-ink-soft">Signed by {author(entry)} · {visitDate(entry.createdOn)}</p></div>
      <dl className={entry.step === 'vitals' ? 'mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4' : 'mt-4 space-y-3 text-sm'}>{entryRows(entry, state.data).filter((row) => row.value !== '—').map((row) => <div key={row.label} className={entry.step === 'vitals' ? '' : 'grid gap-1 sm:grid-cols-[165px_1fr]'}><dt className="font-semibold text-ink-soft">{row.label}</dt><dd className="whitespace-pre-wrap break-words">{row.value}</dd></div>)}</dl>
      {amendments.length ? <div className="mt-4 space-y-3"><h4 className="font-bold">Amendments · {amendments.length}</h4>{amendments.map((amendment) => <div key={amendment.id} className="border-l-2 border-brand-tint pl-3 text-sm"><p className="whitespace-pre-wrap">{String(amendment.values.note ?? '')}</p><p className="mt-1 text-xs text-ink-soft">{author(amendment)} · {visitDate(amendment.createdOn)}{amendment.values.correctedValues ? ' · Structured correction reflected above' : ''}</p></div>)}{original && amendments.some((a) => a.values.correctedValues) ? <details><summary className="cursor-pointer text-sm font-bold text-brand">View original signed values</summary><dl className="mt-3 text-sm">{entryRows(original, state.data).map((row) => <div key={row.label}><dt className="font-bold">{row.label}</dt><dd className="whitespace-pre-wrap">{row.value}</dd></div>)}</dl></details> : null}</div> : <p className="mt-3 text-xs text-ink-soft">Amendments: none</p>}
      {interactive && canRecord ? <Button variant="ghost" fullWidth={false} className="mt-1 min-h-[36px] px-0 py-2 text-sm" onClick={() => addAmendment(entry)}>Add amendment</Button> : null}
    </section>;
  };
  return <section className="space-y-5" aria-label="Saved visit">
    <button type="button" className="min-h-[44px] font-bold text-brand" onClick={onBack}>Back to visits</button>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-extrabold">Visit · {visitDate(encounter.openedOn)}</h2><p className="mt-2 font-semibold">{card.title} · {visitStatusLabel(card.status)}</p><p className="mt-1 text-sm text-ink-soft">Saved entries · reading view{encounter.patientId !== patient.patientId ? ` · Recorded under linked ID ${encounter.patientId}` : ''}</p></div><div className="flex flex-wrap gap-2">{(card.status === 'Open' || Object.values(stationQueues(entries)).some((queue) => queue.length > 0)) && canRecord ? <Button fullWidth={false} onClick={onContinue}>{card.status === 'Open' ? 'Continue visit' : 'Record pending service work'}</Button> : null}<Button variant="outlined" fullWidth={false} onClick={() => showPanel('print')}>Print visit summary</Button><Button variant="outlined" fullWidth={false} onClick={() => showPanel('activity')}>View activity log</Button></div></div>
    {conflictingCorrections(entries).length ? <p role="alert" className="rounded-field bg-amber-bg p-4 text-sm text-amber-text">Competing corrections need reconciliation. Review all amendments and Sync &amp; device before relying on the corrected values.</p> : null}
    <nav aria-label="Saved visit sections" className="flex gap-2 overflow-x-auto border-b border-outline-soft">{Object.entries(GROUPS).map(([key, item]) => <button key={key} type="button" aria-current={selectedGroup === key ? 'page' : undefined} className={`min-h-[48px] shrink-0 border-b-2 px-3 text-sm font-bold ${selectedGroup === key ? 'border-brand text-brand' : 'border-transparent text-ink-soft'}`} onClick={() => setParams((current) => { const next = new URLSearchParams(current); next.set('visitSection', key); return next; }, { replace: true })}>{item.label}</button>)}</nav>
    {selectedGroup === 'summary' ? <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]"><div>{saved.filter((entry) => ['vitals', 'complaint', 'diagnosis'].includes(entry.step)).map((entry) => entryBody(entry, true))}{!saved.some((entry) => ['vitals', 'complaint', 'diagnosis'].includes(entry.step)) ? <p className="text-sm text-ink-soft">Vitals, consultation and diagnosis have not been recorded.</p> : null}</div><aside aria-label="Visit investigations, treatment and follow-up">{saved.filter((entry) => !['vitals', 'complaint', 'diagnosis'].includes(entry.step)).map((entry) => entryBody(entry, true))}{!saved.some((entry) => ['lab_order', 'lab_results'].includes(entry.step)) ? <section className="border-t border-outline-soft py-4"><h3 className="font-bold">Investigations</h3><p className="mt-2 text-sm text-ink-soft">No investigations recorded for this visit.</p></section> : null}<section className="border-t border-outline-soft py-4"><h3 className="font-bold">Visit activity</h3><ol className="mt-3 space-y-3">{state.audit.slice(-5).map((activity, index) => <li key={index} className="text-sm"><b>{activity.action}</b><p className="text-xs text-ink-soft">{activity.actor} · {activity.date} {activity.time}</p></li>)}</ol><Button variant="ghost" fullWidth={false} onClick={() => showPanel('activity')}>View full activity log</Button></section></aside></div> : visible.length ? visible.map((entry) => entryBody(entry, true)) : <p className="text-sm text-ink-soft">No signed entries recorded in this section.</p>}
    {state.data.follow_up.when ? <Button variant="ghost" fullWidth={false} onClick={onAppointments}>View follow-up appointments</Button> : null}
    <p className="border-t border-outline-soft pt-4 text-sm text-ink-soft">Signed originals are retained. Corrections are added as amendments. Device sync status does not by itself confirm server acceptance of this particular entry.</p>
    {panel === 'activity' ? <Sheet title="Visit activity log" placement="side" onClose={() => showPanel()}><ol className="space-y-4">{state.audit.map((activity, index) => <li key={`${index}-${activity.action}`} className="border-l-2 border-brand-tint pl-3"><p className="font-bold">{activity.action}</p><p className="mt-1 text-sm">{activity.actor} · {activity.role}</p><p className="mt-1 text-xs text-ink-soft">{activity.date} · {activity.time}</p></li>)}</ol><p className="mt-5 text-sm text-ink-soft">This is the saved-entry and amendment history for this visit.</p></Sheet> : null}
    {panel === 'print' ? <Sheet title="Visit summary preview" onClose={() => showPanel()}><div ref={printContent}><h1 className="text-xl font-bold">{facility.name} · Visit summary</h1><p className="mt-3 font-bold">{patient.fullName}</p><p className="break-all text-sm">Patient ID: {encounter.patientId}</p><p className="mt-2 text-sm">Visit: {visitDate(encounter.openedOn)} · {visitStatusLabel(card.status)}</p><p className="mt-1 text-sm">{card.label} · {card.title}</p>{saved.map((entry) => entryBody(entry, false))}<p className="mt-3 text-sm">Printed from records on this device. Signed originals and amendments are retained.</p></div>{error ? <p role="alert" className="my-3 text-sm text-danger">{error}</p> : null}<Button onClick={print}>Print summary</Button></Sheet> : null}
    {panel === 'amend' ? <Sheet title="Add amendment" eyebrow={card.label} placement="side" closeDisabled={saving} hasUnsavedChanges={Boolean(note.trim())} onClose={() => { setNote(''); setReviewing(false); showPanel(); }}>
      {canRecord && saved.length ? <div className="space-y-4"><p className="text-sm text-ink-soft">Choose a signed entry. Its original values and author remain in the record.</p><SelectField label="Signed entry to amend" value={targetId} disabled={reviewing || saving} onChange={(event) => { setTargetId(event.target.value); setReviewing(false); }} options={[{ value: '', label: 'Choose a signed entry' }, ...saved.map((entry) => ({ value: entry.id, label: `${STEP_DEFS[entry.step as StepKey].short} · ${visitDate(entry.createdOn)} · ${author(entry)}` }))]} />
        {target ? <><dl className="rounded-field bg-surface-muted p-3 text-sm">{entryRows(saved.find((entry) => entry.id === target.id) ?? target, state.data).map((row) => <div key={row.label} className="mb-2"><dt className="font-bold">{row.label}</dt><dd className="whitespace-pre-wrap">{row.value}</dd></div>)}</dl>{['vitals', 'complaint', 'lab_results', 'diagnosis', 'prescription', 'injection_order', 'injection'].includes(target.step) && !reviewing ? <Button variant="outlined" onClick={() => { showPanel(); setEditor(target); }}>Correct recorded values</Button> : null}<TextAreaField label="Amendment / reason" required help={{ purpose: 'Explain the additional information or correction. The original signed entry is retained.' }} value={note} disabled={reviewing || saving} onChange={(event) => setNote(event.target.value)} />{reviewing ? <p className="rounded-field bg-brand-wash p-3 text-sm">Signing as {user.name}. Your name and the date/time are recorded with this amendment.</p> : null}{error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}{reviewing ? <><Button loading={saving} onClick={() => void save()}>Confirm &amp; sign amendment</Button><Button variant="outlined" disabled={saving} onClick={() => setReviewing(false)}>Keep editing amendment</Button></> : <Button disabled={!note.trim()} onClick={() => setReviewing(true)}>Review amendment</Button>}</> : null}<SheetCancelButton disabled={saving} /></div> : <p className="text-sm text-ink-soft">{!canRecord ? 'You have view access. A clinician can add an amendment.' : 'There are no signed entries to amend.'}</p>}
    </Sheet> : null}
    {editor ? <EntryEditorSheet patientId={encounter.patientId} encounterId={encounter.id} entries={entries} step={editor.step as StepKey} target={editor} onClose={() => { setEditor(undefined); onRefresh(); }} /> : null}
  </section>;
};
