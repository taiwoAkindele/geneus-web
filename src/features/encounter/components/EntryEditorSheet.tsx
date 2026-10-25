import { useRef, useState } from 'react';
import { effectiveEncounterEntries, type EncounterEntry } from '@shared';
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

type Props = { patientId: string; encounterId: string; step: StepKey; entries: EncounterEntry[]; target?: EncounterEntry; onClose: () => void };
export const EntryEditorSheet = ({ patientId, encounterId, step, entries, target, onClose }: Props) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [data, setData] = useState<EncounterData>(() => {
    const effective = target ? effectiveEncounterEntries(entries).find((entry) => entry.id === target.id) : undefined;
    const draft = effective ? fromStepValues(step, effective.values, EMPTY_ENCOUNTER_DATA) : structuredClone(EMPTY_ENCOUNTER_DATA);
    return step === 'lab_results' ? { ...draft, lab_order: { tests: Object.keys(draft.lab_results) } } : draft;
  });
  const [previousCorrectionId] = useState(() => {
    const corrections = entries.filter((entry) => entry.step === 'amendment' && entry.amends === target?.id && entry.values.correctedValues);
    const replaced = new Set(corrections.map((entry) => entry.values.previousAmendmentId));
    return corrections.find((entry) => !replaced.has(entry.id))?.id ?? null;
  });
  const [note, setNote] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const ctl: StepFormController = {
    enc: { data },
    setField: (key, field, value) => setData((current) => ({ ...current, [key]: { ...current[key], [field]: value } })),
    toggleIn: (_key, _field, value) => setData((current) => ({ ...current, lab_order: { tests: current.lab_order.tests.includes(value) ? current.lab_order.tests.filter((test) => test !== value) : [...current.lab_order.tests, value] } })),
    setResult: (test, value) => setData((current) => ({ ...current, lab_results: { ...current.lab_results, [test]: value } })),
    addRx: () => setData((current) => ({ ...current, diagnosis: { ...current.diagnosis, rx: [...current.diagnosis.rx, { name: '', dose: '' }] } })),
    setRx: (index, field, value) => setData((current) => ({ ...current, diagnosis: { ...current.diagnosis, rx: current.diagnosis.rx.map((line, i) => i === index ? { ...line, [field]: value } : line) } })),
    removeRx: (index) => setData((current) => ({ ...current, diagnosis: { ...current.diagnosis, rx: current.diagnosis.rx.filter((_, i) => i !== index) } })),
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
      else await saveStep({ patientId, encounterId, step, values: toStepValues(step, data) }, context);
      toast(target ? 'Correction saved; the original remains in the history' : 'Additional entry saved'); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the entry'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <Sheet title={`${target ? 'Correct' : 'Record another'} ${STEP_DEFS[step].short.toLowerCase()}`} onClose={onClose} closeDisabled={saving}>
    <p className="mb-4 text-sm text-ink-muted">{target ? 'This adds a signed correction. The original entry remains available below.' : 'Record a new observation or progress note at this time.'}</p>
    <fieldset disabled={saving}>
      {reviewing ? <dl className="space-y-2 text-sm">{summarize(data, step).map((row) => <div key={row.label}><dt className="font-bold">{row.label}</dt><dd className="whitespace-pre-wrap">{row.value}</dd></div>)}{target ? <p className="mt-2">Reason: {note}</p> : null}</dl> : <>
        <StepForm stepKey={step} ctl={ctl} correcting={Boolean(target)} />
        {target ? <div className="mt-4"><TextAreaField label="Reason for correction" name="correction_reason"
          help={ENCOUNTER_FIELD_HELP.correction} value={note} onChange={(event) => setNote(event.target.value)} /></div> : null}
      </>}
    </fieldset>
    {target ? <details className="mt-4 text-sm"><summary>Original recorded values</summary><dl>{Object.entries(target.values).map(([key, value]) => <div key={key}><dt className="font-semibold">{key}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl></details> : null}
    {error ? <p role="alert" className="my-3 text-sm text-danger">{error}</p> : null}
    <div className="mt-4 space-y-2"><Button disabled={saving} loading={saving} onClick={reviewing ? save : review}>{reviewing ? 'Confirm & save permanently' : 'Review entry'}</Button>{reviewing ? <Button variant="outlined" disabled={saving} onClick={() => setReviewing(false)}>Keep editing</Button> : null}</div>
  </Sheet>;
};
