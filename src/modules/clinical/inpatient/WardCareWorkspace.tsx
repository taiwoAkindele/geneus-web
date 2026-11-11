import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { activeAdmission, INPATIENT_STATUS, effectiveEncounterEntries, orderLine, wardSessionComplete, wardPrescriptionLines, type PrescriptionLine, type WardCareEvent, type WardRecords, type EncounterEntry } from '@shared';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext, useSession } from '@/session';
import { usePatient } from '@/modules/front-desk/search';
import { Button, SelectField, Sheet, TextAreaField } from '@/ui';
import { loadWardCare, activeWardOrders, currentDischargeSummary, type WardSession } from '@/data/repos/wardCare';
import { amendEntry } from '@/data/repos/encounters';
import { useInpatient } from './useInpatient';
import { WardSessionSheet } from './WardSessionSheet';
import { WardMedicationSheet } from './WardMedicationSheet';
import { WardDischargeSheet } from './WardDischargeSheet';
import { fromStepValues } from '@/modules/clinical/encounter/stepValues';
import { EMPTY_ENCOUNTER_DATA } from '@/modules/clinical/encounter/encounterRecord';
import { STEP_DEFS } from '@/modules/clinical/encounter/steps';
import { summarize } from '@/modules/clinical/encounter/useEncounter';
import type { StepKey } from '@/modules/clinical/encounter/types';
import { wardCareSupported } from '@/data/wardCareSupport';
import { listStaff } from '@/data/repos/staff';
import { pendingWorkforceIds } from '@/data/repos/workforce';
import { listWardDrafts } from '@/data/repos/drafts';
import { patientIdentityIds } from '@/data/repos/patientIdentity';
import { EntryEditorSheet } from '@/modules/clinical/encounter/components/EntryEditorSheet';
import { AdmissionMedicationSheet } from './AdmissionMedicationSheet';

export const WardCareWorkspace = ({ patientId }: { patientId: string }) => {
  const context = useAuthorizationContext(), { facility } = useSession(), inpatient = useInpatient(), patient = usePatient(patientId);
  const [params, setParams] = useSearchParams();
  const identities = useLiveQuery(useCallback(() => patientIdentityIds(patientId), [patientId]));
  const stays = (inpatient.data?.heads ?? []).filter((e) => (identities.data ?? [patientId]).includes(e.patientId)).sort((a, b) => Number(activeAdmission(b)) - Number(activeAdmission(a)) || b.createdOn.localeCompare(a.createdOn));
  const admissionId = params.get('admission') ?? stays[0]?.admissionId ?? '';
  const admission = stays.find((e) => e.admissionId === admissionId);
  const recordPatientId = admission?.patientId ?? patientId;
  const query = useLiveQuery(useCallback(async () => {
    if (!admissionId) return undefined;
    const [records, staff, pending, drafts] = await Promise.all([loadWardCare(admissionId, context), listStaff(), pendingWorkforceIds(), listWardDrafts({ staffId: context.userId!, patientId: recordPatientId }, admissionId)]);
    return { records, staff, pending, drafts };
  }, [admissionId, recordPatientId, context.userId, context.permissions.join('|')]));
  const [editor, setEditor] = useState<{ session: WardSession; step: StepKey; changeOrder?: WardCareEvent }>();
  const [medication, setMedication] = useState<{ session: WardSession; order: WardCareEvent; action: 'administration' | 'continue' | 'stop'; previous?: WardCareEvent }>();
  const [discharge, setDischarge] = useState<WardSession>(), [summary, setSummary] = useState<WardCareEvent>(), [correction, setCorrection] = useState<EncounterEntry>();
  const [structuredCorrection, setStructuredCorrection] = useState<EncounterEntry>();
  const [admissionMedicine, setAdmissionMedicine] = useState<{ session: WardSession; sourceEntryId: string; line: PrescriptionLine }>();
  const [note, setNote] = useState(''), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const printContent = useRef<HTMLDivElement>(null), correcting = useRef(false);
  useEffect(() => { const refresh = () => query.reload(); window.addEventListener('geneus:wardCareSupport', refresh); return () => window.removeEventListener('geneus:wardCareSupport', refresh); }, [query.reload]);
  if (inpatient.loading || patient.loading || identities.loading) return <p role="status">Reading inpatient care…</p>;
  if (inpatient.error || patient.error) return <div role="alert"><p>Inpatient care could not be read.</p><Button onClick={() => { inpatient.reload(); patient.reload(); }}>Try again</Button></div>;
  if (!stays.length) return <p className="rounded-field border border-outline p-4">No inpatient stay is recorded for this patient.</p>;
  if (!admission || !patient.data) return <p role="alert">This admission is not available for this patient.</p>;
  const data = query.data?.records, pending = query.data?.pending ?? new Set<string>();
  const writable = !query.loading && !query.error && activeAdmission(admission) && context.permissions.includes('encounter:record') && wardCareSupported(context);
  const session = (purpose: WardSession['purpose']): WardSession => ({ id: `encounter:${crypto.randomUUID()}`, admissionId, patientId: recordPatientId, purpose });
  const nameOf = (id: string) => query.data?.staff.find((s) => s.staffId === id)?.fullName ?? id;
  const saved = () => { query.reload(); inpatient.reload(); };
  const entries = data ? effectiveEncounterEntries(data.entries) : [];
  const orders = data ? activeWardOrders(data) : [];
  const summaries = data ? currentDischargeSummary(data) : [];
  const timeline = data ? [...data.entries.map((entry) => ({ id: entry.id, time: entry.performedOn ?? entry.createdOn, entry, event: undefined as WardCareEvent | undefined })), ...data.events.map((event) => ({ id: event.id, time: event.occurredOn, entry: undefined as EncounterEntry | undefined, event }))].sort((a, b) => b.time.localeCompare(a.time) || b.id.localeCompare(a.id)) : [];
  const print = () => {
    const popup = window.open('', '_blank', 'width=800,height=900');
    if (!popup || !printContent.current) { setError('Allow the print window and try again.'); return; }
    const style = popup.document.createElement('style'); style.textContent = 'body{font:14px Arial,sans-serif;padding:24px;color:#111}dt{font-weight:bold;margin-top:16px}dd{margin:4px 0;white-space:pre-wrap}h1{font-size:22px}';
    popup.document.head.append(style); popup.document.body.append(printContent.current.cloneNode(true)); popup.focus(); popup.print();
  };
  const correct = async () => {
    if (!correction || correcting.current) return; correcting.current = true; setSaving(true);
    try { await amendEntry(correction, note, context); setCorrection(undefined); setNote(''); saved(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The correction could not be saved'); } finally { correcting.current = false; setSaving(false); }
  };
  return <section className="space-y-5" aria-label="Ward care">
    <header className="space-y-2"><h2 className="text-2xl font-extrabold">Ward care</h2><p className="text-sm">One admission · {INPATIENT_STATUS[admission.action]} · {nameOf(admission.createdBy)}</p>
      <SelectField label="Inpatient stay" value={admissionId} onChange={(e) => { setEditor(undefined); setMedication(undefined); setDischarge(undefined); setParams((p) => { const next = new URLSearchParams(p); next.set('admission', e.target.value); return next; }); }} options={stays.map((e) => ({ value: e.admissionId, label: `${new Date(inpatient.data!.events.find((v) => v.id === e.admissionId)!.createdOn).toLocaleDateString('en-GB')} · ${INPATIENT_STATUS[e.action]}` }))} />
      <p className="text-sm text-ink-soft">{[inpatient.data?.locations.find((l) => l.id === admission.wardId)?.name, inpatient.data?.locations.find((l) => l.id === admission.bedId)?.name].filter(Boolean).join(' · ') || 'Awaiting a bed'} · {inpatient.data?.units.find((u) => u.id === admission.receivingUnitId)?.name}</p>
      {pending.has(admission.id) ? <p className="text-sm text-amber-text">Admission changes await server confirmation.</p> : null}
      {!wardCareSupported(context) ? <p className="text-sm text-amber-text">Connect once to enable continuing ward care on this device.</p> : null}
    </header>
    {query.loading ? <p role="status">Reading the stay history…</p> : query.error ? <div role="alert"><p>Care history could not be read.</p><Button onClick={query.reload}>Try again</Button></div> : null}
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {writable && data ? <div className="flex flex-wrap gap-2">
      <Button fullWidth={false} onClick={() => setEditor({ session: session('nursing'), step: 'vitals' })}>Record observations</Button>
      <Button variant="outlined" fullWidth={false} onClick={() => setEditor({ session: session('nursing'), step: 'complaint' })}>Add nursing note</Button>
      {context.permissions.includes('clinical:diagnose') ? <Button variant="outlined" fullWidth={false} onClick={() => setEditor({ session: session('review'), step: 'complaint' })}>Doctor review</Button> : null}
      {context.permissions.includes('clinical:prescribe') ? <Button variant="outlined" fullWidth={false} onClick={() => setDischarge(session('discharge'))}>{summaries.length ? 'Revise discharge summary' : 'Prepare discharge'}</Button> : null}
    </div> : null}
    {!activeAdmission(admission) && context.permissions.includes('encounter:record') && wardCareSupported(context) && data ? <Button variant="outlined" fullWidth={false} onClick={() => setEditor({ session: session('nursing'), step: 'complaint' })}>Report late care for independent review</Button> : null}
    {writable && query.data?.drafts.map((draft) => <div key={draft.session.id} className="rounded-field border border-outline p-3"><p className="text-sm">Your unfinished {draft.session.purpose === 'nursing' ? 'nursing note / observations' : 'doctor review'}</p><Button variant="outlined" fullWidth={false} onClick={() => { const target = draft.changeOrderId ? data?.events.find((e) => e.id === draft.changeOrderId) : undefined; if (draft.changeOrderId && !target) { setError('The original medication decision is unavailable. Sync and review it before resuming this change.'); return; } setEditor({ session: draft.session, step: draft.step, changeOrder: target }); }}>Resume private draft</Button></div>)}
    {writable && data?.encounters.filter((e) => e.inpatientContext && e.createdBy === context.userId && !wardSessionComplete(e.id, data.events)).map((e) => <Button key={e.id} variant="outlined" fullWidth={false} onClick={() => setEditor({ session: { id: e.id, admissionId, patientId: e.patientId, purpose: e.inpatientContext!.purpose }, step: 'complaint' })}>Continue {e.inpatientContext!.purpose === 'nursing' ? 'nursing activity' : e.inpatientContext!.purpose === 'discharge' ? 'discharge review' : 'doctor review'} · {new Date(e.openedOn).toLocaleString('en-GB')}</Button>)}
    {data ? <section className="space-y-3"><h3 className="text-lg font-bold">Current medication orders</h3>{!orders.length ? <p className="text-sm text-ink-soft">No active ward medication orders recorded.</p> : orders.map((order) => { const line = orderLine(order, data.entries); return <article key={order.id} className="space-y-2 rounded-field border border-outline p-4"><p className="font-bold">{line?.drug} · {line?.dose}</p><p className="text-sm">{[line?.frequency,line?.duration,line?.route].filter(Boolean).join(' · ')}</p>{pending.has(order.id) ? <p className="text-sm text-amber-text">Order awaiting server confirmation</p> : null}<div className="flex flex-wrap gap-2">
      {writable && context.permissions.includes('clinical:administer') ? <Button variant="outlined" fullWidth={false} onClick={() => setMedication({ session: session('nursing'), order, action: 'administration' })}>Record administration</Button> : null}
      {writable && context.permissions.includes('clinical:prescribe') ? <><Button variant="outlined" fullWidth={false} onClick={() => setEditor({ session: session('review'), step: 'complaint', changeOrder: order })}>Change order</Button><Button variant="ghost" fullWidth={false} onClick={() => setMedication({ session: session('review'), order, action: 'continue' })}>Continue order</Button><Button variant="ghost" fullWidth={false} onClick={() => setMedication({ session: session('review'), order, action: 'stop' })}>Stop order</Button></> : null}
    </div></article>; })}</section> : null}
    {data && writable && context.permissions.includes('clinical:prescribe') ? <section className="space-y-2" aria-label="Admission prescriptions to review">{entries.filter((e) => e.encounterId === admission.encounterId && ['prescription','diagnosis'].includes(e.step) && !data.entries.some((a) => a.amends === e.id && a.values.correctedValues)).flatMap((entry) => wardPrescriptionLines(entry).filter((line) => !data.events.some((e) => e.values.kind === 'medication' && e.values.sourceEntryId === entry.id && e.values.lineId === line.lineId)).map((line) => <article key={line.lineId} className="space-y-2 rounded-field border border-outline p-3"><p className="font-bold">Admission prescription · {line.drug} · {line.dose}</p><Button variant="outlined" fullWidth={false} onClick={() => setAdmissionMedicine({ session: session('review'), sourceEntryId: entry.id, line })}>Review for ward use</Button></article>))}</section> : null}
    {data ? <section className="space-y-3"><h3 className="text-lg font-bold">Investigations and results</h3>{data.encounters.filter((e) => entries.some((v) => v.encounterId === e.id && v.step === 'lab_order')).map((encounter) => { const care = entries.filter((e) => e.encounterId === encounter.id); return <article key={encounter.id} className="space-y-2 rounded-field border border-outline p-3"><p className="text-sm font-bold">Requested {new Date(care.find((e) => e.step === 'lab_order')!.createdOn).toLocaleString('en-GB')}</p><p className="text-sm">{(care.find((e) => e.step === 'lab_order')!.values.tests as string[]).join(', ')}</p>{care.filter((e) => e.step === 'lab_results').flatMap((e) => (e.values.results as { test: string; result: string }[]).map((r, index) => <p key={`${e.id}:${index}`} className="text-sm">{r.test}: {r.result}</p>))}<Link className="inline-flex min-h-[44px] items-center font-bold text-brand underline" to={`/encounters/record?${new URLSearchParams({ patient: patientId, visit: encounter.id, task: 'result_review' })}`}>Review results / outstanding work</Link></article>; })}</section> : null}
    {data?.events.some((e) => e.values.kind === 'discharge') ? <section className="space-y-2"><h3 className="text-lg font-bold">Signed discharge summaries</h3>{data.events.filter((e) => e.values.kind === 'discharge').map((e) => <Button key={e.id} variant="outlined" fullWidth={false} onClick={() => setSummary(e)}>View / print {summaries.some((s) => s.id === e.id) ? 'current' : 'previous'} summary · {new Date(e.createdOn).toLocaleString('en-GB')}</Button>)}<Link className="inline-flex min-h-[44px] items-center font-bold text-brand underline" to={'/admissions?' + new URLSearchParams({ tab: 'inpatients', patient: patientId })}>Readiness, departure & bed management</Link></section> : null}
    <section className="space-y-3"><h3 className="text-lg font-bold">Stay history</h3>{!timeline.length && !query.loading ? <p>No signed care entries are available yet.</p> : null}<ol className="space-y-3">{timeline.map(({ id, time, entry, event }) => <li key={id} className="min-w-0 space-y-2 rounded-field border border-outline p-4">
      <p className="text-xs text-ink-soft">{new Date(time).toLocaleString('en-GB')} · {nameOf((entry ?? event)!.createdBy)}{pending.has(id) ? ' · Awaiting server confirmation' : ''}</p>
      {entry ? <><h4 className="font-bold">{entry.step === 'amendment' ? 'Correction to earlier care' : STEP_DEFS[entry.step].title}</h4>{entry.step === 'amendment' ? <p className="whitespace-pre-wrap text-sm">{String(entry.values.note)}</p> : <dl className="space-y-1">{summarize(fromStepValues(entry.step, entry.values, structuredClone(EMPTY_ENCOUNTER_DATA)), entry.step).map((row, i) => <div key={i}><dt className="text-xs font-bold">{row.label}</dt><dd className="whitespace-pre-wrap break-words text-sm">{row.value}</dd></div>)}</dl>}{context.permissions.includes('encounter:record') && ['vitals','complaint','diagnosis','lab_results'].includes(entry.step) ? <Button variant="ghost" fullWidth={false} onClick={() => setStructuredCorrection(entry)}>Correct recorded values</Button> : null}{context.permissions.includes('encounter:record') && entry.step !== 'amendment' ? <Button variant="ghost" fullWidth={false} onClick={() => { setNote(''); setCorrection(entry); }}>Add correction note</Button> : null}</> : event ? <WardEventBody event={event} records={data!} onCorrect={writable && context.permissions.includes('clinical:administer') && event.values.kind === 'administration' ? () => { const v = event.values; if (v.kind !== 'administration') return; const order = data!.events.find((e) => e.id === v.orderEventId); if (order) setMedication({ session: session('nursing'), order, action: 'administration', previous: event }); } : undefined} /> : null}
    </li>)}</ol></section>
    <p className="text-xs text-ink-soft">Local care remains visible while synchronization is pending. Refused work is retained in <Link className="underline" to="/sync">Sync & review</Link>. A signed record is corrected through its history.</p>
    {editor && data ? <WardSessionSheet key={editor.session.id} session={editor.session} initialStep={editor.step} changeOrder={editor.changeOrder} records={data} onClose={() => setEditor(undefined)} onSaved={saved} /> : null}
    {medication && data ? <WardMedicationSheet key={medication.session.id} {...medication} records={data} onClose={() => setMedication(undefined)} onSaved={saved} /> : null}
    {admissionMedicine ? <AdmissionMedicationSheet {...admissionMedicine} onClose={() => setAdmissionMedicine(undefined)} onSaved={saved} /> : null}
    {discharge && data ? <WardDischargeSheet key={discharge.id} session={discharge} records={data} patient={patient.data} previous={summaries.length === 1 ? summaries[0] : undefined} onClose={() => setDischarge(undefined)} onSaved={saved} /> : null}
    {correction ? <Sheet title="Add correction note" onClose={() => setCorrection(undefined)} closeDisabled={saving} hasUnsavedChanges={Boolean(note)}><TextAreaField label="Correction / explanation" value={note} onChange={(e) => setNote(e.target.value)} /><p className="my-3 text-sm">The original care entry remains unchanged. This adds your signed explanation beside it.</p>{error ? <p role="alert">{error}</p> : null}<Button disabled={saving || note.trim().length < 3} onClick={() => void correct()}>Sign correction note</Button></Sheet> : null}
    {structuredCorrection && data && structuredCorrection.step !== 'amendment' ? <EntryEditorSheet patientId={recordPatientId} encounterId={structuredCorrection.encounterId} step={structuredCorrection.step} entries={data.entries.filter((e) => e.encounterId === structuredCorrection.encounterId)} target={structuredCorrection} onClose={() => { setStructuredCorrection(undefined); saved(); }} /> : null}
    {summary?.values.kind === 'discharge' ? <Sheet title="Signed discharge summary" onClose={() => setSummary(undefined)}><div ref={printContent}><h1 className="text-xl font-bold">{facility.name} · Discharge summary</h1><p className="my-2 font-bold">{summary.values.patientName} · {summary.values.patientIdentifier}</p><p className="text-sm">Admitted {new Date(summary.values.admittedOn).toLocaleString('en-GB')}</p><dl className="space-y-3">{([['admissionReason','Reason for admission'],['diagnoses','Discharge diagnoses'],['course','Care during stay'],['findings','Relevant findings'],['pending','Outstanding work'],['instructions','Instructions']] as const).map(([key, label]) => <div key={key}><dt className="font-bold">{label}</dt><dd className="whitespace-pre-wrap">{summary.values.kind === 'discharge' ? summary.values[key] || 'Not recorded' : ''}</dd></div>)}<dt className="font-bold">Take-home medicines</dt><dd className="whitespace-pre-wrap">{summary.values.takeHome.map((r) => [r.drug,r.dose,r.frequency,r.duration,r.route].filter(Boolean).join(' · ')).join('\n') || 'None required — explicitly reviewed'}</dd><dt className="font-bold">Follow-up</dt><dd>{summary.values.followUpOn ?? 'No date recorded'}</dd></dl><p className="mt-4 text-sm">Signed by {nameOf(summary.createdBy)} · {new Date(summary.createdOn).toLocaleString('en-GB')} · Record {summary.id}</p><p className="text-xs">Printed from this signed revision. Later results and revised summaries remain in the chart.</p></div><Button className="mt-4" onClick={print}>Print this signed revision</Button></Sheet> : null}
  </section>;
};

const WardEventBody = ({ event, records, onCorrect }: { event: WardCareEvent; records: WardRecords; onCorrect?: () => void }) => {
  const v = event.values;
  if (v.kind === 'complete') return <p className="text-sm font-bold">Care activity completed{v.note ? ' · ' + v.note : ''}</p>;
  if (v.kind === 'medication') { const line = orderLine(event, records.entries); return <><h4 className="font-bold">Medication order · {v.action}</h4><p className="text-sm">{line?.drug} · {line?.dose} · {line?.frequency} {line?.route}</p>{v.note ? <p className="text-sm">{v.note}</p> : null}</>; }
  if (v.kind === 'administration') { const order = records.events.find((e) => e.id === v.orderEventId); const line = order && orderLine(order, records.entries); return <><h4 className="font-bold">{line?.drug} · {v.outcome === 'given' ? 'Given' : 'Not given'}{v.previousId ? ' · Corrected record' : ''}</h4><p className="text-sm">{v.dose} · {v.route} {v.reason ? ' · ' + v.reason : ''}</p>{onCorrect ? <Button variant="ghost" fullWidth={false} onClick={onCorrect}>Correct administration</Button> : null}</>; }
  return <p className="font-bold">Discharge summary signed{v.previousId ? ' · Revised version' : ''}</p>;
};
