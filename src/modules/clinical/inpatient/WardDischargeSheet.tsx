import { useEffect, useRef, useState } from 'react';
import { effectiveEncounterEntries, type Patient, type WardRecords, type WardCareEvent } from '@shared';
import { Button, Sheet, TextAreaField, TextField } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { useDeviceContext } from '@/data';
import { StepForm } from '@/modules/clinical/encounter/components/StepForm';
import { toStepValues, stepProblems } from '@/modules/clinical/encounter/stepValues';
import { saveWardEvent, type WardSession } from '@/data/repos/wardCare';
import { discardDraft, readDrafts, writeDraft } from '@/data/repos/drafts';
import { zonedInstant } from '@/lib/workforceTime';
import { useWardForm } from './useWardForm';

export const WardDischargeSheet = ({ session, records, patient, previous, onClose, onSaved }: { session: WardSession; records: WardRecords; patient: Patient; previous?: WardCareEvent; onClose: () => void; onSaved: () => void }) => {
  const context = useAuthorizationContext(), { facility } = useDeviceContext(), { data, setData, ctl } = useWardForm();
  const original = records.admissions.find((e) => e.id === session.admissionId)!;
  const sources = effectiveEncounterEntries(records.entries).filter((e) => e.encounterId !== session.id);
  const prior = previous?.values.kind === 'discharge' ? previous.values : undefined;
  const [form, setForm] = useState(() => ({ admissionReason: prior?.admissionReason ?? String(records.entries.find((e) => e.id === original.requestEntryId)?.values.note ?? ''),
    diagnoses: prior?.diagnoses ?? sources.filter((e) => e.step === 'diagnosis').map((e) => String(e.values.diagnosis)).join('\n'), course: prior?.course ?? '', findings: prior?.findings ?? sources.filter((e) => e.step === 'lab_results').flatMap((e) => (e.values.results as { test: string; result: string }[]).map((r) => r.test + ': ' + r.result)).join('\n'), pending: prior?.pending ?? records.encounters.flatMap((encounter) => { const care = records.entries.filter((e) => e.encounterId === encounter.id); const tests = care.filter((e) => e.step === 'lab_order').flatMap((e) => e.values.tests as string[]); const done = new Set(care.filter((e) => e.step === 'lab_results').flatMap((e) => (e.values.results as { test: string }[]).map((r) => r.test))); return tests.filter((test) => !done.has(test)).map((test) => 'Pending result: ' + test); }).join('\n'), instructions: prior?.instructions ?? '', followUpOn: prior?.followUpOn ?? '' }));
  const [reviewing, setReviewing] = useState(false), [saving, setSaving] = useState(false), [error, setError] = useState(''), [ready, setReady] = useState(false);
  const [baseSummaryId, setBaseSummaryId] = useState(previous?.id);
  const [sourceEntryIds, setSourceEntryIds] = useState(() => records.entries.filter((e) => e.encounterId !== session.id).map((e) => e.id));
  const [sourceWardEventIds, setSourceWardEventIds] = useState(() => records.events.filter((e) => e.values.kind === 'medication' || e.values.kind === 'administration').map((e) => e.id));
  const newEntries = records.entries.filter((e) => e.encounterId !== session.id && !sourceEntryIds.includes(e.id));
  const newMedication = records.events.filter((e) => ['medication','administration'].includes(e.values.kind) && !sourceWardEventIds.includes(e.id));
  const sourceChanged = baseSummaryId !== previous?.id || newEntries.length > 0 || newMedication.length > 0;
  const owner = { staffId: context.userId!, patientId: session.patientId, encounterKey: `ward-discharge:${session.admissionId}` };
  const busy = useRef(false), latest = useRef({ form, data, baseSummaryId, sourceEntryIds, sourceWardEventIds }); latest.current = { form, data, baseSummaryId, sourceEntryIds, sourceWardEventIds };
  useEffect(() => {
    let active = true;
    readDrafts(owner).then((drafts) => { const saved = drafts.find((d) => d.step === 'summary')?.data as typeof latest.current | undefined; if (active && saved) { setForm(saved.form); setData(saved.data); setBaseSummaryId(saved.baseSummaryId); setSourceEntryIds(saved.sourceEntryIds ?? []); setSourceWardEventIds(saved.sourceWardEventIds ?? []); } if (active) setReady(true); }).catch(() => setError('The discharge draft could not be restored. Close and retry.'));
    return () => { active = false; };
  }, [session.admissionId]);
  useEffect(() => { if (!ready) return; const timer = window.setTimeout(() => { void writeDraft(owner, 'summary', latest.current).catch(() => setError('The private discharge draft could not be saved')); }, 250); return () => window.clearTimeout(timer); }, [form, data, ready, baseSummaryId, sourceEntryIds, sourceWardEventIds]);
  const close = async () => { try { if (ready) await writeDraft(owner, 'summary', latest.current); onClose(); } catch { setError('The private draft could not be saved. Keep this form open.'); } };
  const save = async () => {
    if (busy.current || !ready) return;
    if (sourceChanged) { setError('Care or the signed summary changed. Review the new information before signing this draft.'); return; }
    setError('');
    const issues = stepProblems('prescription', data);
    if (issues.length) { setError('Review take-home medicines: ' + issues.join('. ')); return; }
    if (!form.admissionReason.trim() || !form.diagnoses.trim() || !form.course.trim() || !form.instructions.trim()) { setError('Complete the admission reason, diagnoses, care summary and discharge instructions'); return; }
    if (!reviewing) { setReviewing(true); return; }
    busy.current = true; setSaving(true);
    try {
      const takeHome = toStepValues('prescription', data).prescription;
      await saveWardEvent(session, { kind: 'discharge', ...form, findings: form.findings || undefined, pending: form.pending || undefined, followUpOn: form.followUpOn || undefined, previousId: baseSummaryId,
        takeHome: takeHome as Extract<WardCareEvent['values'], { kind: 'discharge' }>['takeHome'], sourceEntryIds, sourceWardEventIds, patientName: patient.fullName, patientIdentifier: session.patientId, admittedOn: original.createdOn,
      }, context, { followUpAt: form.followUpOn ? zonedInstant(form.followUpOn + 'T09:00', facility?.timeZone ?? 'Africa/Lagos') : undefined });
      await discardDraft(owner, 'summary'); onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The discharge summary could not be signed'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <Sheet title={previous ? 'Revise discharge summary' : 'Prepare discharge summary'} eyebrow={patient.fullName} onClose={() => void close()} closeDisabled={saving} hasUnsavedChanges>
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">Review the stay history before signing. Take-home medicines are chosen explicitly; signing does not record departure or release the bed.</p>
      {sourceChanged ? <div role="alert" className="space-y-3 rounded-field border border-amber-500 p-3"><p>Care or the current signed summary changed since this draft began. Review the new information and update your text and take-home medicine decisions.</p>{previous?.values.kind === 'discharge' && previous.id !== baseSummaryId ? <details><summary className="font-bold">Current signed summary</summary><p className="whitespace-pre-wrap">{previous.values.course}</p><p className="whitespace-pre-wrap">{previous.values.instructions}</p></details> : null}<ul className="list-disc pl-4">{newEntries.map((e) => <li key={e.id}>New {e.step === 'amendment' ? 'correction' : e.step.replace(/_/g,' ')} · {new Date(e.createdOn).toLocaleString('en-GB')}</li>)}{newMedication.map((e) => <li key={e.id}>New medication decision / administration · {new Date(e.createdOn).toLocaleString('en-GB')}</li>)}</ul><Button variant="outlined" onClick={() => { setBaseSummaryId(previous?.id); setSourceEntryIds(records.entries.filter((e) => e.encounterId !== session.id).map((e) => e.id)); setSourceWardEventIds(records.events.filter((e) => ['medication','administration'].includes(e.values.kind)).map((e) => e.id)); setReviewing(false); }}>I reviewed the changes; continue editing</Button></div> : null}
      {!ready ? <p role="status">Restoring private draft…</p> : reviewing ? <dl className="space-y-3">{Object.entries(form).filter(([, value]) => value).map(([key, value]) => <div key={key}><dt className="font-bold">{({ admissionReason: 'Admission reason', diagnoses: 'Discharge diagnoses', course: 'Care summary', findings: 'Relevant findings', pending: 'Outstanding work', instructions: 'Instructions', followUpOn: 'Follow-up' } as Record<string, string>)[key]}</dt><dd className="whitespace-pre-wrap">{value}</dd></div>)}<dt className="font-bold">Take-home medicines</dt><dd>{data.prescription.decision === 'none_required' ? 'None required — explicitly reviewed' : data.prescription.rx.map((line) => [line.name,line.dose,line.frequency,line.duration,line.route].filter(Boolean).join(' · ')).join('\n')}</dd></dl> : <>
        {([['admissionReason','Reason for admission'], ['diagnoses','Discharge diagnoses'], ['course','Care during the stay'], ['findings','Relevant findings / results'], ['pending','Outstanding results / follow-up responsibilities'], ['instructions','Discharge instructions']] as const).map(([key, label]) => <TextAreaField key={key} label={label} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />)}
        <h3 className="font-bold">Take-home medicines</h3><StepForm stepKey="prescription" ctl={ctl} patientId={session.patientId} />
        <TextField label="Follow-up date (optional)" type="date" value={form.followUpOn} onChange={(e) => setForm((f) => ({ ...f, followUpOn: e.target.value }))} />
      </>}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button disabled={saving || !ready || sourceChanged} onClick={() => void save()}>{saving ? 'Saving…' : reviewing ? 'Confirm & sign discharge summary' : 'Review discharge summary'}</Button>
      {reviewing ? <Button variant="outlined" disabled={saving} onClick={() => setReviewing(false)}>Keep editing</Button> : null}
      <Button variant="ghost" disabled={saving} onClick={() => void close()}>Save draft & close</Button>
    </div>
  </Sheet>;
};
