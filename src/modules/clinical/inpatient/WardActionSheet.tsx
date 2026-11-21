import { useEffect, useRef, useState } from 'react';
import { activeAdmission, orderLine, wardAdmission, type WardCareEvent, type WardRecords } from '@shared';
import { Button, Sheet, TextAreaField, TextField, useToast } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { useDeviceContext } from '@/data';
import { StepForm } from '@/modules/clinical/encounter/components/StepForm';
import { EMPTY_ENCOUNTER_DATA } from '@/modules/clinical/encounter/encounterRecord';
import { stepProblems, toStepValues } from '@/modules/clinical/encounter/stepValues';
import type { EncounterData, StepKey } from '@/modules/clinical/encounter/types';
import { summarize } from '@/modules/clinical/encounter/useEncounter';
import { discardDraft, readDrafts, writeDraft } from '@/data/repos/drafts';
import { saveWardEvent, saveWardStep, type WardSession } from '@/data/repos/wardCare';
import { zonedInstant } from '@/lib/workforceTime';
import { userMessage } from '@/lib/api/userMessage';
import { useWardForm } from './useWardForm';

/** One thing done on the ward, signed on its own. */
export type WardAction = 'note' | 'observations' | 'diagnosis' | 'tests' | 'medicine' | 'injection';
const STEP: Record<WardAction, StepKey> = { note: 'complaint', observations: 'vitals', diagnosis: 'diagnosis', tests: 'lab_order', medicine: 'prescription', injection: 'injection_order' };
export const actionForStep = (step: StepKey): WardAction | undefined => (Object.keys(STEP) as WardAction[]).find((k) => STEP[k] === step);
const TITLE: Record<WardAction, string> = { note: 'Add progress note', observations: 'Record observations', diagnosis: 'Update diagnosis', tests: 'Order tests', medicine: 'Add medicine', injection: 'Order injection' };
const DONE: Record<WardAction, string> = { note: 'Progress note signed', observations: 'Observations signed', diagnosis: 'Diagnosis updated', tests: 'Tests ordered', medicine: 'Medicine added', injection: 'Injection ordered' };
/** Ward rules: a diagnosis or treatment decision follows the clinician's reason, recorded in the same activity. */
const NEEDS_REASON: readonly WardAction[] = ['diagnosis', 'medicine'];
const REASON_LABEL: Partial<Record<WardAction, string>> = { diagnosis: 'Why the diagnosis has changed', medicine: 'Reason for this treatment decision' };

/**
 * A single ward action (a note, observations, a diagnosis, tests, a medicine or an injection) for doctors and
 * nurses alike: fill in, check, sign. Each action is its own care activity: nurses' notes and observations are
 * recorded as nursing activities, everything else as a short doctor activity that is closed once signed.
 * The repository and its rules are unchanged; the server still checks every permission.
 */
export const WardActionSheet = ({ session, action, records, changeOrder, onClose, onSaved }: {
  session: WardSession; action: WardAction; records: WardRecords; changeOrder?: WardCareEvent; onClose: () => void; onSaved: () => void;
}) => {
  const context = useAuthorizationContext(), toast = useToast(), { facility } = useDeviceContext();
  const step = STEP[action];
  const heads = wardAdmission(records, session.admissionId);
  const ended = heads.length === 1 && !activeAdmission(heads[0]);
  const initial = structuredClone(EMPTY_ENCOUNTER_DATA);
  if (changeOrder) {
    const line = orderLine(changeOrder, records.entries);
    if (line) initial.prescription = { decision: 'prescribed', rx: [{ name: line.drug, dose: line.dose, frequency: line.frequency, duration: line.duration, route: line.route }] };
  }
  if (action === 'medicine' && !changeOrder) initial.prescription = { decision: 'prescribed', rx: [{ name: '', dose: '' }] };
  if (action === 'injection') initial.injection_order = { ...initial.injection_order, required: true };
  const { data, setData, ctl } = useWardForm(initial);
  const [reason, setReason] = useState(''), [showLate, setShowLate] = useState(ended), [performedOn, setPerformedOn] = useState(''), [lateReason, setLateReason] = useState('');
  const [reviewing, setReviewing] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(''), [ready, setReady] = useState(false), [edited, setEdited] = useState(false);
  const busy = useRef(false);
  const owner = { staffId: context.userId!, patientId: session.patientId, encounterKey: `ward:${session.admissionId}:${session.id}` };
  const latest = useRef({ data, step, performedOn, lateReason, session, changeOrderId: changeOrder?.id, reason });
  latest.current = { data, step, performedOn, lateReason, session, changeOrderId: changeOrder?.id, reason };
  const title = action === 'medicine' && changeOrder ? 'Change medicine' : TITLE[action];

  // Private drafts: restored on open, saved while typing, kept on close.
  useEffect(() => {
    let active = true;
    readDrafts(owner).then((drafts) => {
      const draft = drafts.find((d) => d.step === 'ward_form')?.data as { data?: EncounterData; performedOn?: string; lateReason?: string; reason?: string } | undefined;
      if (active && draft?.data) { setData(draft.data); setPerformedOn(draft.performedOn ?? ''); setLateReason(draft.lateReason ?? ''); setReason(draft.reason ?? ''); if (draft.performedOn || draft.lateReason) setShowLate(true); setEdited(true); }
      if (active) setReady(true);
    }).catch(() => { if (active) setError('Your saved draft could not be restored. Close and try again before continuing.'); });
    return () => { active = false; };
  }, [session.id]);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => { void writeDraft(owner, 'ward_form', latest.current).catch(() => setError('The draft could not be saved. Keep this form open and try again.')); }, 250);
    return () => window.clearTimeout(timer);
  }, [data, performedOn, lateReason, reason, ready]);
  const close = async () => {
    try { if (ready && edited) await writeDraft(owner, 'ward_form', latest.current); onClose(); }
    catch { setError('Your draft could not be saved. Keep this form open.'); }
  };

  const problems = (): string[] => {
    const found: string[] = [];
    if (action === 'note' && !data.complaint.note.trim()) found.push('Write the progress note');
    else if (action !== 'note') found.push(...stepProblems(step, data));
    if (NEEDS_REASON.includes(action) && reason.trim().length < 3) found.push(`Add the ${REASON_LABEL[action]!.toLowerCase()}`);
    if (ended && (!performedOn || lateReason.trim().length < 3)) found.push('Say when this care happened and why it is recorded late');
    return found;
  };
  const check = () => {
    const found = problems();
    if (found.length) { setError(found.join('. ')); toast(found[0], { tone: 'error' }); return; }
    setError(''); setReviewing(true);
  };
  const sign = async () => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    const options = { performedOn: performedOn ? zonedInstant(performedOn, facility?.timeZone ?? 'Africa/Lagos') : undefined, lateReason: lateReason.trim() || undefined };
    try {
      if (NEEDS_REASON.includes(action)) await saveWardStep(session, 'complaint', { complaints: [], note: reason.trim() }, context, options);
      await saveWardStep(session, step, toStepValues(step, data), context, { ...options, changeOrder: step === 'prescription' ? changeOrder : undefined });
      // A doctor activity holds just this one decision, so it is closed now; nursing activities close themselves.
      if (session.purpose === 'review' && !ended) await saveWardEvent(session, { kind: 'complete' }, context);
      await discardDraft(owner, 'ward_form');
      toast(ended ? 'Kept for independent review' : changeOrder ? 'Medicine changed' : DONE[action]);
      onSaved(); onClose();
    } catch (cause) {
      const message = userMessage(cause, 'This care could not be saved. Your entries are kept; try again.');
      setError(message); toast(message, { tone: 'error' }); setReviewing(false);
    } finally { busy.current = false; setSaving(false); }
  };

  const reviewRows = [...(NEEDS_REASON.includes(action) ? [{ label: REASON_LABEL[action]!, value: reason.trim() }] : []),
    ...(action === 'note' ? [{ label: 'Progress note', value: data.complaint.note }] : summarize(data, step)),
    ...(performedOn ? [{ label: 'Care happened', value: `${performedOn.replace('T', ' ')}${lateReason ? ` · ${lateReason}` : ''}` }] : [])];

  return <Sheet placement="side" title={title} onClose={() => void close()} closeDisabled={saving} hasUnsavedChanges={edited}>
    <div className="space-y-4" onChange={() => setEdited(true)}>
      {ended ? <p className="rounded-field border border-amber-border bg-amber-bg p-3 text-sm text-amber-text">This stay has ended. What you record is kept for review by another qualified clinician, not added to the stay straight away.</p> : null}
      {!ready ? <p role="status">Restoring your draft…</p> : reviewing ? <>
        <p className="rounded-field bg-brand-wash p-3 text-sm">Check this before signing. It's signed in your name and can only be corrected afterwards, not changed.</p>
        <dl className="space-y-3">{reviewRows.filter((r) => r.value).map((row, i) => <div key={i}><dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">{row.label}</dt><dd className="whitespace-pre-wrap break-words text-sm">{row.value}</dd></div>)}</dl>
      </> : <>
        {NEEDS_REASON.includes(action) ? <TextAreaField label={REASON_LABEL[action]!} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action === 'diagnosis' ? 'e.g. Chest X-ray shows right lower lobe consolidation' : 'e.g. Still febrile on day 3; switching to IV antibiotics'} /> : null}
        {action === 'note'
          ? <TextAreaField label="How the patient is now" value={data.complaint.note} onChange={(e) => setData((d) => ({ ...d, complaint: { ...d.complaint, note: e.target.value } }))} placeholder="What the patient reports, what you found, your assessment and plan" />
          : <StepForm stepKey={step} ctl={ctl} patientId={session.patientId} />}
        {showLate || ended ? <div className="space-y-3 rounded-field border border-outline-soft p-3">
          <p className="text-sm font-semibold">Care given earlier</p>
          <TextField label="When it happened" type="datetime-local" value={performedOn} onChange={(e) => setPerformedOn(e.target.value)} />
          <TextAreaField label="Why it's recorded late" value={lateReason} onChange={(e) => setLateReason(e.target.value)} />
          {!ended ? <Button variant="ghost" fullWidth={false} className="!px-0 !py-1" onClick={() => { setShowLate(false); setPerformedOn(''); setLateReason(''); }}>It happened just now</Button> : null}
        </div> : <Button variant="ghost" fullWidth={false} className="!px-0 !py-1" onClick={() => setShowLate(true)}>Recording care from earlier?</Button>}
      </>}
      {error ? <p role="alert" className="whitespace-pre-wrap rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
      {ready ? reviewing
        ? <div className="flex gap-2"><Button variant="outlined" fullWidth={false} disabled={saving} onClick={() => setReviewing(false)}>Edit</Button><Button className="flex-1" loading={saving} onClick={() => void sign()}>Confirm &amp; sign</Button></div>
        : <Button disabled={saving} onClick={check}>Check &amp; sign</Button> : null}
      <p className="text-center text-xs text-ink-muted">Drafts save automatically. Closing keeps them.</p>
    </div>
  </Sheet>;
};
