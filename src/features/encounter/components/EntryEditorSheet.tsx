import { useRef, useState } from 'react';
import { effectiveEncounterEntries, dispositionHeads, type EncounterEntry } from '@shared';
import { amendEntry, saveStep } from '@/data/repos/encounters';
import { useAuthorizationContext } from '@/session';
import { Button, Sheet, TextAreaField, useToast } from '@/ui';
import { ENCOUNTER_FIELD_HELP } from '../fieldHelp';
import { EMPTY_ENCOUNTER_DATA } from '../encounterRecord';
import { fromStepValues, stepProblems, toStepValues } from '../stepValues';
import { STEP_DEFS } from '../steps';
import type { EncounterData, StepKey } from '../types';
import { StepForm, type StepFormController } from './StepForm';
import { summarize } from '../useEncounter';
import { entryRows } from '../visitContent';

type Props = { patientId: string; encounterId: string; step: StepKey; entries: EncounterEntry[]; target?: EncounterEntry; onClose: () => void };
export const EntryEditorSheet = ({ patientId, encounterId, step, entries, target, onClose }: Props) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [data, setData] = useState<EncounterData>(() => {
    const effective = target ? effectiveEncounterEntries(entries).find((entry) => entry.id === target.id) : undefined;
    let draft = structuredClone(EMPTY_ENCOUNTER_DATA);
    for (const entry of effectiveEncounterEntries(entries)) if (entry.step !== 'amendment') draft = fromStepValues(entry.step, entry.values, draft);
    if (target) draft.workflowVersion = target.workflowVersion;
    if (effective) draft = fromStepValues(step, effective.values, draft);
    if (step === 'result_review' && !target) { const reviewed = new Set(entries.filter((e) => e.step === 'result_review').flatMap((e) => e.values.resultEntryIds as string[])); draft.result_review = { resultEntryIds: entries.filter((e) => e.step === 'lab_results' && !reviewed.has(e.id)).map((e) => e.id), note: '' }; }
    if (step === 'disposition' && !target) draft.disposition = { ...draft.disposition, kind: '', note: '', previousEntryId: dispositionHeads(entries)[0]?.id };
    if (step === 'lab_results' && !target) { const completed = new Set(Object.keys(draft.lab_results)); draft = { ...draft, lab_order: { ...draft.lab_order, tests: draft.lab_order.tests.filter((t, index) => !completed.has(draft.lab_order.items?.[index]?.id ?? t)), items: draft.lab_order.items?.filter((i) => !completed.has(i.id)) }, lab_results: {} }; }
    if (step === 'lab_results' && target) {
      const rows = effective?.values.results as { test: string; result: string; orderItemId?: string }[];
      draft = { ...draft, lab_order: { ...draft.lab_order, tests: rows.map((r) => r.test), items: draft.lab_order.items?.filter((i) => rows.some((r) => r.orderItemId === i.id)) }, lab_results: Object.fromEntries(rows.map((r) => [r.orderItemId ?? r.test, r.result])) };
    }
    return draft;
  });
  const [previousCorrectionId] = useState(() => {
    const corrections = entries.filter((entry) => entry.step === 'amendment' && entry.amends === target?.id && entry.values.correctedValues);
    const replaced = new Set(corrections.map((entry) => entry.values.previousAmendmentId));
    return corrections.find((entry) => !replaced.has(entry.id))?.id ?? null;
  });
  const [note, setNote] = useState('');
  const initialValues = useRef(JSON.stringify(data));
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const ctl: StepFormController = {
    enc: { data },
    setField: (key, field, value) => setData((current) => ({ ...current, [key]: { ...current[key], [field]: value } })),
    toggleIn: (_key, _field, value) => setData((current) => ({ ...current, lab_order: { tests: current.lab_order.tests.includes(value) ? current.lab_order.tests.filter((test) => test !== value) : [...current.lab_order.tests, value] } })),
    setResult: (test, value) => setData((current) => ({ ...current, lab_results: { ...current.lab_results, [test]: value } })),
    addRx: () => setData((current) => ({ ...current, prescription: { ...current.prescription, rx: [...current.prescription.rx, { name: '', dose: '' }] } })),
    setRx: (index, field, value) => setData((current) => ({ ...current, prescription: { ...current.prescription, rx: current.prescription.rx.map((line, i) => i === index ? { ...line, [field]: value } : line) } })),
    removeRx: (index) => setData((current) => ({ ...current, prescription: { ...current.prescription, rx: current.prescription.rx.filter((_, i) => i !== index) } })),
    setDispenseReason: (index, reason) => setData((current) => ({ ...current, dispense: { ...current.dispense, reasons: { ...current.dispense.reasons, [index]: reason } } })),
    toggleDispense: (index) => setData((current) => ({ ...current, dispense: { ...current.dispense, done: { ...current.dispense.done, [index]: !current.dispense.done[index] } } })),
  };
  const review = () => {
    const issues = stepProblems(step, data);
    if (target && !note.trim()) issues.push('Explain the correction');
    setError(issues.join(' · '));
    if (!issues.length) setReviewing(true);
  };
  const save = async () => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      if (target) await amendEntry(target, note, context, toStepValues(step, data), previousCorrectionId);
      else await saveStep({ patientId, encounterId, step, workflowVersion: entries.some((e) => e.workflowVersion === 1) ? 1 : undefined, values: toStepValues(step, data) }, context);
      toast(target ? 'Correction saved; the original remains in the history' : 'Additional entry saved'); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the entry'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <Sheet title={`${target ? 'Correct' : 'Record another'} ${STEP_DEFS[step].short.toLowerCase()}`} onClose={onClose} closeDisabled={saving} placement="side" hasUnsavedChanges={Boolean(note) || JSON.stringify(data) !== initialValues.current}>
    <p className="mb-4 text-sm text-ink-muted">{target ? 'This adds a signed correction. The original entry remains available below.' : 'Record a new observation or progress note at this time.'}</p>
    <fieldset disabled={saving}>
      {reviewing ? <dl className="space-y-2 text-sm">{summarize(data, step).map((row) => <div key={row.label}><dt className="font-bold">{row.label}</dt><dd className="whitespace-pre-wrap">{row.value}</dd></div>)}{target ? <p className="mt-2">Reason: {note}</p> : null}</dl> : <>
        <StepForm stepKey={step} ctl={ctl} correcting={Boolean(target)} />
        {target ? <div className="mt-4"><TextAreaField label="Reason for correction" name="correction_reason"
          help={ENCOUNTER_FIELD_HELP.correction} value={note} onChange={(event) => setNote(event.target.value)} /></div> : null}
      </>}
    </fieldset>
    {target ? <details className="mt-4 text-sm"><summary>Original recorded values</summary><dl>{entryRows(target).map((row) => <div key={row.label} className="mt-2"><dt className="font-semibold">{row.label}</dt><dd className="whitespace-pre-wrap break-words">{row.value}</dd></div>)}</dl></details> : null}
    {error ? <p role="alert" className="my-3 text-sm text-danger">{error}</p> : null}
    <div className="mt-4 space-y-2"><Button disabled={saving} loading={saving} onClick={reviewing ? save : review}>{reviewing ? 'Confirm & save permanently' : 'Review entry'}</Button>{reviewing ? <Button variant="outlined" disabled={saving} onClick={() => setReviewing(false)}>Keep editing</Button> : null}</div>
  </Sheet>;
};
