import { useEffect, useRef, useState } from 'react';
import { effectiveEncounterEntries, wardSessionComplete, orderLine, type WardRecords, type WardCareEvent } from '@shared';
import { Button, Sheet, SelectField, TextField, TextAreaField } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { StepForm } from '@/modules/clinical/encounter/components/StepForm';
import { STEP_DEFS } from '@/modules/clinical/encounter/steps';
import { EMPTY_ENCOUNTER_DATA } from '@/modules/clinical/encounter/encounterRecord';
import { fromStepValues, toStepValues, stepProblems } from '@/modules/clinical/encounter/stepValues';
import type { EncounterData, StepKey } from '@/modules/clinical/encounter/types';
import { summarize } from '@/modules/clinical/encounter/useEncounter';
import { discardDraft, readDrafts, writeDraft } from '@/data/repos/drafts';
import { saveWardEvent, saveWardStep, type WardSession } from '@/data/repos/wardCare';
import { useWardForm } from './useWardForm';
import { useDeviceContext } from '@/data';
import { activeAdmission, wardAdmission } from '@shared';
import { zonedInstant } from '@/lib/workforceTime';

export const WardSessionSheet = ({ session, records, initialStep, changeOrder, onClose, onSaved }: { session: WardSession; records: WardRecords; initialStep: StepKey; changeOrder?: WardCareEvent; onClose: () => void; onSaved: () => void }) => {
  const context = useAuthorizationContext();
  const { facility } = useDeviceContext();
  const heads = wardAdmission(records, session.admissionId);
  const late = heads.length === 1 && !activeAdmission(heads[0]);
  const entries = effectiveEncounterEntries(records.entries.filter((e) => e.encounterId === session.id));
  const initial = entries.reduce((d, e) => e.step === 'amendment' ? d : fromStepValues(e.step, e.values, d), structuredClone(EMPTY_ENCOUNTER_DATA));
  if (changeOrder) {
    const line = orderLine(changeOrder, records.entries);
    if (line) initial.prescription = { decision: 'prescribed', rx: [{ name: line.drug, dose: line.dose, frequency: line.frequency, duration: line.duration, route: line.route }] };
  }
  const { data, setData, ctl } = useWardForm(initial);
  const [step, setStep] = useState(initialStep), [reviewing, setReviewing] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const [performedOn, setPerformedOn] = useState(''), [lateReason, setLateReason] = useState(''), [ready, setReady] = useState(false), [edited, setEdited] = useState(false);
  const busy = useRef(false), latest = useRef({ data, step, performedOn, lateReason, session, changeOrderId: changeOrder?.id });
  latest.current = { data, step, performedOn, lateReason, session, changeOrderId: changeOrder?.id };
  const owner = { staffId: context.userId!, patientId: session.patientId, encounterKey: `ward:${session.admissionId}:${session.id}` };
  const saved = entries.find((e) => e.step === step);
  const allowed: StepKey[] = session.purpose === 'nursing' ? ['vitals','complaint'] : ['complaint','vitals','diagnosis','lab_order','prescription','injection_order'];
  useEffect(() => {
    let active = true;
    readDrafts(owner).then((drafts) => {
      const draft = drafts.find((d) => d.step === 'ward_form')?.data as { data?: EncounterData; step?: StepKey; performedOn?: string; lateReason?: string } | undefined;
      if (active && draft?.data) { setData(draft.data); if (draft.step && allowed.includes(draft.step)) setStep(draft.step); setPerformedOn(draft.performedOn ?? ''); setLateReason(draft.lateReason ?? ''); setEdited(true); }
      if (active) setReady(true);
    }).catch(() => { if (active) { setError('The private draft could not be restored. Retry before continuing.'); } });
    return () => { active = false; };
  }, [session.id]);
  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => { void writeDraft(owner, 'ward_form', latest.current).catch(() => setError('The draft could not be saved. Keep this form open and retry.')); }, 250);
    return () => window.clearTimeout(timer);
  }, [data, step, performedOn, lateReason, ready]);
  const close = async () => {
    try { if (ready) await writeDraft(owner, 'ward_form', latest.current); onClose(); } catch { setError('The private draft could not be saved. Keep this form open.'); }
  };
  const save = async () => {
    if (busy.current || !ready) return;
    setError('');
    if (late && (!performedOn || lateReason.trim().length < 3)) { setError('Late documentation needs the actual care time and an explanation. It will be held for independent review.'); return; }
    const problems = stepProblems(step, data);
    if (problems.length) { setError(problems.join('. ')); return; }
    if (!reviewing) { setReviewing(true); return; }
    busy.current = true; setSaving(true);
    try {
      await saveWardStep(session, step, toStepValues(step, data), context, { performedOn: performedOn ? zonedInstant(performedOn, facility?.timeZone ?? 'Africa/Lagos') : undefined, lateReason: lateReason || undefined, changeOrder: step === 'prescription' ? changeOrder : undefined });
      await discardDraft(owner, 'ward_form'); setReviewing(false); setEdited(false); onSaved();
      if (session.purpose === 'nursing') onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Care could not be saved. Your form is retained.'); }
    finally { busy.current = false; setSaving(false); }
  };
  const complete = async () => {
    if (busy.current) return; busy.current = true; setSaving(true);
    try { await saveWardEvent(session, { kind: 'complete' }, context); await discardDraft(owner, 'ward_form'); onSaved(); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The activity could not be completed'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <Sheet title={session.purpose === 'nursing' ? 'Ward observations & notes' : 'Doctor review'} eyebrow="Continuing inpatient care" onClose={() => void close()} closeDisabled={saving} hasUnsavedChanges={edited}>
    <div className="space-y-4" onChange={() => setEdited(true)}>
      <p className="text-sm text-ink-soft">This activity belongs to the current admission. Earlier signed care remains in the stay history.</p>
      {late ? <p className="text-sm text-amber-text">This stay has ended. Reported care is retained in Clinical reviews for a different qualified reviewer; it is not added as accepted ward care now.</p> : null}
      <SelectField label="Section to record" value={step} onChange={(e) => { setStep(e.target.value as StepKey); setReviewing(false); setError(''); }} options={allowed.map((key) => ({ value: key, label: STEP_DEFS[key].title }))} />
      {!ready ? <p role="status">Restoring private draft…</p> : reviewing || saved ? <dl className="space-y-3">{summarize(data, step).map((row, index) => <div key={index}><dt className="text-sm font-bold">{row.label}</dt><dd className="whitespace-pre-wrap break-words text-sm">{row.value}</dd></div>)}</dl> : <StepForm stepKey={step} ctl={ctl} patientId={session.patientId} />}
      {!saved ? <><TextField label="Actual care time (optional)" type="datetime-local" value={performedOn} onChange={(e) => setPerformedOn(e.target.value)} /><TextAreaField label="Late documentation reason (if applicable)" value={lateReason} onChange={(e) => setLateReason(e.target.value)} /></> : <p className="text-sm text-brand">This section is signed. Record a fresh review for new decisions; corrections retain the original entry.</p>}
      {error ? <p role="alert" className="whitespace-pre-wrap text-sm text-danger">{error}</p> : null}
      {!saved ? <Button disabled={saving || !ready} onClick={() => void save()}>{saving ? 'Saving…' : reviewing ? 'Confirm & sign section' : 'Review section'}</Button> : null}
      {reviewing ? <Button variant="outlined" disabled={saving} onClick={() => setReviewing(false)}>Keep editing</Button> : null}
      {session.purpose !== 'nursing' && entries.length && !wardSessionComplete(session.id, records.events) ? <Button variant="outlined" disabled={saving} onClick={() => void complete()}>Finish this review</Button> : null}
      <Button variant="ghost" disabled={saving} onClick={() => void close()}>Save draft & close</Button>
    </div>
  </Sheet>;
};
