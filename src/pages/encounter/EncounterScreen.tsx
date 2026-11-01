import { PatientChartAccess } from '@/features/patients/PatientChartAccess';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { conflictingCorrections, effectiveEncounterEntries, outstandingResults, type EncounterEntry } from '@shared';
import { ActionMenu, Button, TextAreaField, TextField, useToast } from '@/ui';
import { AuthorizationError } from '@/data';
import { useAuthorizationContext, useSession } from '@/session';
import { AmendSheet, isClosingStep, ReviewSaveSheet, STEP_DEFS, StepForm, stepsFor, summarize, useEncounter, type EncounterNavState, type StepKey } from '@/features/encounter';
import { EntryEditorSheet } from '@/features/encounter/components/EntryEditorSheet';
import { usePatient } from '@/features/search';
import { useAppointments } from '@/features/appointments';
import { AllergyAlert } from '@/features/clinical';
import { patientChartPath } from '@/features/patients/patientRoutes';
import { ENCOUNTER_FIELD_HELP } from '@/features/encounter/fieldHelp';

export const EncounterScreen = () => <PatientChartAccess><EncounterContent/></PatientChartAccess>;
const EncounterContent = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const state = (useLocation().state as EncounterNavState) ?? {};
  const patientId = params.get('patient') ?? state.patientId;
  const encounterId = params.get('visit') ?? state.encounterId;
  const appointmentId = params.get('appointment') ?? state.appointmentId;
  const requestedReturn = params.get('returnTo');
  const task = params.get('task');
  const initialTask = task && task in STEP_DEFS ? task as StepKey : undefined;
  const returnTo = requestedReturn && (requestedReturn.startsWith('/patients/profile?') || requestedReturn.startsWith('/encounters?') || requestedReturn.startsWith('/patients/search?')) ? requestedReturn : patientId ? patientChartPath(patientId, 'visits') : '/patients/search';
  if (!patientId) return <div className="p-6 text-sm"><p>Open a visit from the patient record.</p><Button variant="ghost" onClick={() => navigate('/patients/search')}>Patients</Button></div>;
  return <EncounterRecord key={patientId + '|' + (encounterId ?? appointmentId ?? 'new') + '|' + initialTask} initialTask={initialTask} patientId={patientId} encounterId={encounterId} appointmentId={appointmentId} returnTo={returnTo} />;
};

const EncounterRecord = ({ patientId, encounterId, appointmentId, returnTo, initialTask }: { initialTask?: StepKey; patientId: string; encounterId?: string; appointmentId?: string; returnTo: string }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useSession();
  const context = useAuthorizationContext();
  const canRecord = context.permissions.includes('encounter:record');
  const patient = usePatient(patientId);
  const [selected, setSelected] = useState<StepKey | undefined>(initialTask);
  const ctl = useEncounter(patientId, encounterId, appointmentId, selected);
  const appointments = useAppointments();
  const { enc } = ctl;
  const steps = stepsFor(enc.data);
  const chosen = steps.find((step) => step.key === selected) ?? steps[enc.activeIndex] ?? steps[0];
  const [reviewKey, setReviewKey] = useState<StepKey>();
  const [amendKey, setAmendKey] = useState<StepKey>();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  const [collectLaterReason, setCollectLaterReason] = useState('');
  const [entryEditor, setEntryEditor] = useState<{ step: StepKey; target?: EncounterEntry }>();
  const heading = useRef<HTMLHeadingElement>(null);
  const awaitingPayment = !enc.id && appointments.appointments.find((a) => a.id === appointmentId)?.paymentStatus === 'Awaiting payment';
  useEffect(() => {
    document.title = 'Record visit · Geneus Health';
    heading.current?.focus({ preventScroll: true });
  }, [chosen?.key, ctl.loading]);
  useEffect(() => {
    // A closed visit opens on its record, unless arriving for work still allowed after closure (a late result, its review, dispensing).
    if (!ctl.loading && enc.closed && enc.id && !(initialTask && ['lab_results', 'result_review', 'dispense', 'injection'].includes(initialTask))) {
      const next = new URLSearchParams(returnTo.startsWith('/patients/profile?') ? returnTo.split('?')[1] : { patient: patientId });
      next.set('tab', 'visits'); next.set('visit', enc.id); next.delete('panel'); next.delete('visitSection');
      navigate('/patients/profile?' + next, { replace: true });
    }
  }, [ctl.loading, enc.closed, enc.id, navigate, patientId, returnTo, initialTask]);

  if (patient.loading || (ctl.loading && !enc.id)) return <p role="status" className="p-6">Opening the visit…</p>;
  if (patient.error || ctl.error) return <div role="alert" className="p-6"><p>{ctl.error?.message ?? 'The patient record could not be read.'}</p><Button variant="ghost" onClick={() => { patient.reload(); ctl.reload(); }}>Try again</Button><Button variant="outlined" onClick={() => navigate(returnTo)}>Back to patient / visits</Button></div>;
  if (!patient.data) return <p className="p-6">This patient is not on this device.</p>;
  const record = patient.data;
  const locked = Boolean(enc.sig[chosen.key]);
  const current = steps[enc.activeIndex]?.key;

  const serviceTask = ['lab_results', 'result_review', 'dispense', 'injection'].includes(chosen.key);
  const editable = canRecord && (!enc.closed || serviceTask) && !locked;
  const signature = enc.sig[chosen.key];
  const choose = (key: StepKey) => { ctl.flushDraft(); setError(''); setSelected(key); };
  const review = () => { const problems = ctl.problems(chosen.key); if (problems.length) { setError(problems.join(' · ')); heading.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); } else { setError(''); setReviewKey(chosen.key); } };
  const confirmSave = async () => {
    if (!reviewKey || busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      await ctl.lockStep(reviewKey, collectLaterReason);
      toast((isClosingStep(reviewKey) && !(reviewKey === 'disposition' && enc.data.disposition.kind === 'observation')) ? 'Visit completed and signed on this device' : STEP_DEFS[reviewKey].short + ' signed and saved on this device');
      setReviewKey(undefined); setSelected(undefined);
      requestAnimationFrame(() => heading.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    } catch (cause) {
      if (!(cause instanceof AuthorizationError)) console.error('Visit save failed', cause);
      setError(cause instanceof Error ? cause.message : 'Could not save. Your entries are still here.'); setReviewKey(undefined);
    } finally { busy.current = false; setSaving(false); }
  };
  // Results the diagnosis is waiting for: tests without a result, and results not yet reviewed.
  const outstanding = outstandingResults(effectiveEncounterEntries(ctl.rawEntries));
  const resultsOutstanding = !enc.sig.diagnosis && !enc.closed && (outstanding.pending.length > 0 || outstanding.unreviewed.length > 0);
  // Results that arrived and are not yet reviewed, named by test, for the banner at the top of the visit.
  const readyTests = ctl.rawEntries.filter((entry) => outstanding.unreviewed.includes(entry.id)).flatMap((entry) => (entry.values.results as { test: string }[]).map((result) => result.test));
  const continueWithoutResults = () => {
    if (!enc.data.diagnosis.pendingResultsReason?.trim()) { setError('Record why you are continuing without the results'); return; }
    ctl.skip('lab_results'); ctl.skip('result_review'); setError(''); setSelected('diagnosis');
  };
  const pendingResultsPanel = resultsOutstanding && canRecord && ['lab_results', 'result_review', 'diagnosis'].includes(chosen.key) ? <section aria-label="Outstanding results" className="mb-5 space-y-3 rounded-field border border-amber-border bg-amber-bg p-4 text-sm">
    <h3 className="font-bold">{outstanding.pending.length ? 'Waiting for laboratory results' : 'Results waiting for your review'}</h3>
    {outstanding.pending.length ? <p>Not yet resulted: {outstanding.pending.join(', ')}. The laboratory enters results from its queue.</p> : <p>Review the results before the diagnosis.</p>}
    <TextAreaField label="Reason for continuing without results" value={enc.data.diagnosis.pendingResultsReason ?? ''} placeholder="Example: Patient is unstable; treating on clinical grounds while culture is processed" onChange={(event) => ctl.setField('diagnosis', 'pendingResultsReason', event.target.value)} />
    {chosen.key !== 'diagnosis' ? <Button variant="outlined" fullWidth={false} onClick={continueWithoutResults}>Continue to diagnosis without results</Button> : <p className="text-amber-text">The reason is signed with the diagnosis. Results that arrive later appear in Results ready for review.</p>}
  </section> : null;
  const viewSaved = () => enc.id && navigate(patientChartPath(patientId, 'visits', { visit: enc.id }));
  return <div className="min-h-screen bg-white px-4 pb-8 pt-4 md:px-8">
    <button type="button" className="mb-4 min-h-[44px] font-bold text-brand" onClick={() => navigate(returnTo)}>{returnTo.startsWith('/patients/') ? 'Back to patient record' : 'Back to visits'}</button>
    <header className="border-b border-outline-soft pb-4"><div className="flex flex-wrap justify-between gap-3"><div><h1 className="text-2xl font-extrabold">{record.fullName}</h1><p className="mt-1 break-all font-mono text-sm text-ink-soft">{record.patientId}</p></div><div className="flex flex-wrap gap-2"><Button variant="outlined" fullWidth={false} className="min-h-[44px] px-3 py-3 text-sm" onClick={() => navigate(patientChartPath(patientId))}>Full medical chart</Button>{enc.id ? <Button variant="outlined" fullWidth={false} className="min-h-[44px] px-3 py-3 text-sm" onClick={viewSaved}>View signed entries</Button> : null}</div></div><div className="mt-3"><AllergyAlert patientId={patientId} /></div></header>
    <div className="my-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-extrabold">Current visit</h2><p className="mt-1 text-sm text-ink-soft">{enc.id ? 'Opened ' + enc.openedDate : 'The visit starts when its first clinical entry is signed.'}</p></div>{enc.id && canRecord && !enc.closed ? <ActionMenu label="Additional entries" actions={[{ label: 'Record another observation', onSelect: () => setEntryEditor({ step: 'vitals' }) }, { label: 'Add progress note', onSelect: () => setEntryEditor({ step: 'complaint' }) }, ...(enc.data.disposition.kind === 'observation' ? [{ label: 'Record next disposition', onSelect: () => setEntryEditor({ step: 'disposition' }) }] : [])]} /> : null}</div>
    {awaitingPayment && canRecord ? <section className="mb-5 space-y-2 rounded-field border border-amber-border bg-amber-bg p-4"><h3 className="font-bold">See now — collect later</h3><p className="text-sm">Care can continue before payment. Record a reason; the bill remains outstanding.</p><TextField label="Reason for seeing the patient before payment" help={ENCOUNTER_FIELD_HELP.collectLater} value={collectLaterReason} onChange={(event) => setCollectLaterReason(event.target.value)} /></section> : null}
    {conflictingCorrections(ctl.rawEntries).length ? <p role="alert" className="mb-4 rounded-field bg-amber-bg p-4 text-sm text-amber-text">Competing corrections need reconciliation. Review signed entries and Sync &amp; device.</p> : null}
    {readyTests.length && canRecord && chosen.key !== 'result_review' ? <section role="status" aria-label="Results ready" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-field border border-brand-tint bg-brand-wash p-4"><p className="font-bold text-brand">{readyTests.join(', ')} result{readyTests.length === 1 ? '' : 's'} ready</p><Button fullWidth={false} onClick={() => choose('result_review')}>Review results</Button></section> : null}
    {ctl.draftRestoredAt ? <p role="status" className="mb-4 rounded-field bg-amber-bg p-3 text-sm text-amber-text">Unsaved work restored from {new Date(ctl.draftRestoredAt).toLocaleString('en-GB')}. Review it before signing.</p> : null}
    <div className="grid items-start gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
      <nav aria-label="Visit tasks" className="flex gap-2 overflow-x-auto border-b border-outline-soft pb-3 lg:flex-col lg:border-b-0 lg:border-r lg:pb-0 lg:pr-4">{steps.map((step) => {
        const saved = Boolean(enc.sig[step.key]); const skipped = enc.skipped.includes(step.key); const active = step.key === current;
        return <button key={step.key} type="button" disabled={enc.closed && !saved && !['lab_results', 'result_review', 'dispense', 'injection'].includes(step.key)} aria-current={chosen.key === step.key ? 'step' : undefined} onClick={() => choose(step.key)} className={`min-h-[60px] shrink-0 rounded-field px-3 py-3 text-left text-sm disabled:opacity-60 ${chosen.key === step.key ? 'bg-brand-wash font-bold text-brand' : 'text-ink-soft'}`}><span className="block font-bold">{step.short}</span><span className="mt-1 block text-xs">{saved ? 'Signed' : active ? 'Current task' : skipped ? 'Not recorded · can revisit' : 'Upcoming'}</span></button>;
      })}</nav>
      <section className="min-w-0" aria-label="Current task">
        <h2 ref={heading} tabIndex={-1} className="scroll-mt-20 text-2xl font-extrabold outline-none">{chosen.title}</h2><p className="mb-5 mt-1 text-sm text-ink-soft">{chosen.hint}</p>
        {pendingResultsPanel}
        {locked ? <><dl className="space-y-4 text-sm">{summarize(enc.data, chosen.key).map((row) => <div key={row.label}><dt className="font-bold text-ink-soft">{row.label}</dt><dd className="mt-1 whitespace-pre-wrap">{row.value}</dd></div>)}</dl>{signature ? <p className="mt-5 border-t border-outline-soft pt-4 text-sm">Signed by {signature.actor} · {signature.role} · {signature.date} {signature.time}</p> : null}{enc.amend[chosen.key]?.map((amendment, index) => <p key={index} className="mt-3 whitespace-pre-wrap border-l-2 border-brand-tint pl-3 text-sm">{amendment.note} · {amendment.by} · {amendment.date} {amendment.time}</p>)}{canRecord ? <div className="mt-4 flex flex-wrap gap-2">{chosen.key === 'result_review' && ctl.rawEntries.some((e) => e.step === 'lab_results' && !ctl.rawEntries.some((r) => r.step === 'result_review' && (r.values.resultEntryIds as string[]).includes(e.id))) ? <Button variant="outlined" onClick={() => setEntryEditor({ step: 'result_review' })}>Review pending results</Button> : null}{chosen.key === 'lab_results' && enc.data.lab_order.tests.some((t, index) => !enc.data.lab_results[enc.data.lab_order.items?.[index]?.id ?? t]) ? <Button variant="outlined" onClick={() => setEntryEditor({ step: 'lab_results' })}>Record pending results</Button> : null}<Button variant="outlined" fullWidth={false} onClick={() => setAmendKey(chosen.key)}>Add amendment</Button>{['vitals', 'complaint', 'lab_results', 'diagnosis', 'prescription', 'injection_order', 'injection'].includes(chosen.key) ? <Button variant="outlined" fullWidth={false} onClick={() => setEntryEditor({ step: chosen.key, target: ctl.rawEntries.find((entry) => entry.id === enc.entries[chosen.key]?.id) })}>Correct recorded values</Button> : null}</div> : null}{current ? <Button className="mt-5" onClick={() => setSelected(undefined)}>Continue to {STEP_DEFS[current].short}</Button> : null}</> : editable ? <>
          <StepForm stepKey={chosen.key} ctl={ctl} />
          {error ? <p role="alert" className="mt-5 rounded-field border border-danger bg-danger-bg p-4 text-sm text-danger-strong">{error}</p> : null}
          <p className="mt-5 rounded-field bg-amber-bg p-3 text-sm text-amber-text">Draft on this device · not signed</p>
          <Button className="mt-4" disabled={saving || ctl.loading} onClick={chosen.key === 'investigation_review' && enc.data.investigation_review.decision === 'ordered' ? () => { ctl.skip('investigation_review'); setSelected('lab_order'); } : review}>{chosen.key === 'investigation_review' && enc.data.investigation_review.decision === 'ordered' ? 'Choose investigations' : chosen.key === 'disposition' && enc.data.disposition.kind === 'observation' ? 'Review & sign observation plan' : isClosingStep(chosen.key) ? 'Review & complete visit' : 'Review & sign ' + chosen.short.toLowerCase()}</Button>
        </> : <p className="text-sm text-ink-soft">{!canRecord ? 'You have view access. A clinician records this task.' : 'Continue the current task before recording this section.'}</p>}
      </section>
    </div>
    {reviewKey ? <ReviewSaveSheet title={STEP_DEFS[reviewKey].title} rows={summarize(enc.data, reviewKey)} actor={{ name: user.name, role: user.role }} confirmLabel={reviewKey === 'disposition' && enc.data.disposition.kind === 'observation' ? 'Confirm & save observation plan' : isClosingStep(reviewKey) ? 'Confirm & complete visit' : 'Confirm & lock'} onConfirm={() => void confirmSave()} onClose={() => setReviewKey(undefined)} saving={saving} /> : null}
    {amendKey ? <AmendSheet onClose={() => setAmendKey(undefined)} onSave={async (note) => { try { await ctl.amendStep(amendKey, note); setAmendKey(undefined); ctl.reload(); toast('Amendment signed and saved on this device'); } catch (cause) { toast(cause instanceof Error ? cause.message : 'Could not save amendment', { tone: 'error' }); } }} /> : null}
    {entryEditor && enc.id ? <EntryEditorSheet patientId={patientId} encounterId={enc.id} entries={ctl.rawEntries} {...entryEditor} onClose={() => { setEntryEditor(undefined); ctl.reload(); }} /> : null}
  </div>;
};
