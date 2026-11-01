import { useDeviceContext } from '@/data';
import { zonedInput, zonedInstant } from '@/lib/workforceTime';
import { InvestigationPicker } from './InvestigationPicker';
import { Button, ChoiceChip, FieldLabel, Icon, SelectField, SelectOrTextField, TextAreaField, TextField } from '@/ui';
import { ENCOUNTER_FIELD_HELP as H, PRESCRIPTION_DURATIONS, PRESCRIPTION_FREQUENCIES, PRESCRIPTION_ROUTES } from '../fieldHelp';
import { INJECTION_ROUTES } from '../steps';
import type { EncounterController } from '../useEncounter';
import type { StepKey } from '../types';
export type StepFormController = Pick<EncounterController, 'setField' | 'toggleIn' | 'setResult' | 'addRx' | 'setRx' | 'removeRx' | 'setDispenseReason' | 'toggleDispense'> & { enc: Pick<EncounterController['enc'], 'data'> };

/** The active-state input form for a given section. Reads/writes through the hook. */
export const StepForm = ({ stepKey, ctl, correcting = false }: { stepKey: StepKey; ctl: StepFormController; correcting?: boolean }) => {
  const { enc, setField, setResult, addRx, setRx, removeRx, setDispenseReason } = ctl;
  const { facility } = useDeviceContext();
  const zone = facility?.timeZone ?? 'Africa/Lagos';
  const d = enc.data;
  const rx = d.prescription.rx.length ? d.prescription.rx : d.diagnosis.rx;

  if (stepKey === 'vitals') {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <TextField label="Temp (°C)" help={H.temperature} name="v_temp" value={d.vitals.temp} inputMode="decimal" onChange={(e) => setField('vitals', 'temp', e.target.value)} />
        <TextField label="BP (mmHg)" help={H.bloodPressure} name="v_bp" value={d.vitals.bp} onChange={(e) => setField('vitals', 'bp', e.target.value)} />
        <TextField label="Pulse (bpm)" help={H.pulse} name="v_pulse" value={d.vitals.pulse} inputMode="numeric" onChange={(e) => setField('vitals', 'pulse', e.target.value)} />
        <TextField label="Weight (kg)" help={H.weight} name="v_weight" value={d.vitals.weight} inputMode="decimal" onChange={(e) => setField('vitals', 'weight', e.target.value)} />
        <TextField label="SpO₂ (%)" help={H.oxygen} name="v_spo2" value={d.vitals.spo2} inputMode="numeric" onChange={(e) => setField('vitals', 'spo2', e.target.value)} />
        <TextField label="Height (cm)" help={H.height} name="v_height" value={d.vitals.height ?? ''} inputMode="decimal" onChange={(e) => setField('vitals', 'height', e.target.value)} />
        <TextField label="Respiratory rate (/min)" help={H.respiratoryRate} name="v_resp" value={d.vitals.respiratoryRate ?? ''} inputMode="numeric" onChange={(e) => setField('vitals', 'respiratoryRate', e.target.value)} />
      </div>
    );
  }

  if (stepKey === 'complaint') {
    return <div className="space-y-4">
      <p className="text-xs leading-relaxed text-ink-muted">Use the fields relevant to this visit. You do not need to repeat the same information in each box. Leave findings blank if they were not assessed.</p>
      <TextAreaField label="Patient's complaints" name="complaint_text" help={H.complaint}
        value={d.complaint.text} placeholder="In the patient's words — e.g. sore throat for two days"
        onChange={(event) => setField('complaint', 'text', event.target.value)} />
      <TextAreaField label="Clinical note" name="complaint_note" help={H.clinicalNote}
        value={d.complaint.note} placeholder={`Example: ${H.clinicalNote.example}`}
        onChange={(event) => setField('complaint', 'note', event.target.value)} />
      <details open={Boolean(d.complaint.historyOfPresentIllness || d.complaint.examination || d.complaint.assessment || d.complaint.plan)} className="rounded-field border border-outline-soft p-3">
      <summary className="cursor-pointer text-sm font-bold text-brand">Use structured history, examination, assessment and plan</summary>
      <div className="mt-4 space-y-4">{([
        { key: 'historyOfPresentIllness', label: 'History of presenting illness', help: H.presentingIllness },
        { key: 'examination', label: 'Examination', help: H.examination },
        { key: 'assessment', label: 'Assessment', help: H.assessment },
        { key: 'plan', label: 'Clinical plan / advice', help: H.plan },
      ] as const).map(({ key, label, help }) => <TextAreaField key={key} label={label} name={`complaint_${key}`}
        help={help} value={d.complaint[key] ?? ''} placeholder={`Example: ${help.example}`}
        onChange={(event) => setField('complaint', key, event.target.value)} />)}</div></details>
    </div>;
  }

  if (stepKey === 'result_review') return <div className="space-y-3"><p>{d.result_review.resultEntryIds.length} result entries awaiting clinical acknowledgment.</p>{d.lab_order.tests.map((test, index) => { const value = d.lab_results[d.lab_order.items?.[index]?.id ?? test]; return value ? <p key={index}><strong>{test}:</strong> {value}</p> : null; })}<TextAreaField label="Clinical review / action taken (optional)" value={d.result_review.note} onChange={(e) => setField('result_review', 'note', e.target.value)} /></div>;
  if (stepKey === 'investigation_review') return <div className="space-y-3"><FieldLabel label="Investigation decision" /><SelectField label="Testing decision" value={d.investigation_review.decision} options={[{ value: '', label: 'Not yet reviewed' }, { value: 'none_required', label: 'No investigations required' }, { value: 'ordered', label: 'Order investigations' }]} onChange={(e) => { setField('investigation_review', 'decision', e.target.value as typeof d.investigation_review.decision); if (e.target.value === 'none_required') { setField('lab_order', 'items', []); setField('lab_order', 'tests', []); } }} /><TextAreaField label="Reason / clinical question (optional)" value={d.investigation_review.reason} onChange={(e) => setField('investigation_review', 'reason', e.target.value)} />{d.investigation_review.decision === 'ordered' ? <p>Choose and sign investigations in the next section. This decision is signed with the order.</p> : null}</div>;
  if (stepKey === 'lab_order') return <InvestigationPicker items={d.lab_order.items ?? []} onChange={(items) => { setField('lab_order', 'items', items); setField('lab_order', 'tests', items.map((i) => i.name)); }} />;
  if (stepKey === 'injection_order') return <div className="space-y-3"><SelectField label="Injection treatment" value={d.injection_order.required ? 'yes' : 'no'} options={[{ value: 'no', label: 'No injection ordered' }, { value: 'yes', label: 'Order injection' }]} onChange={(e) => { setField('injection_order', 'required', e.target.value === 'yes'); if (e.target.value === 'no') for (const field of ['drug', 'dose', 'route', 'instructions'] as const) setField('injection_order', field, ''); }} />{d.injection_order.required ? <><TextField label="Medicine" value={d.injection_order.drug} onChange={(e) => setField('injection_order', 'drug', e.target.value)} /><TextField label="Dose" value={d.injection_order.dose} onChange={(e) => setField('injection_order', 'dose', e.target.value)} /><SelectField label="Route" value={d.injection_order.route} options={['', ...INJECTION_ROUTES].map((value) => ({ value, label: value || 'Choose route' }))} onChange={(e) => setField('injection_order', 'route', e.target.value)} /><TextAreaField label="Instructions (optional)" value={d.injection_order.instructions} onChange={(e) => setField('injection_order', 'instructions', e.target.value)} /></> : null}<p>Signing an order does not record administration.</p></div>;
  if (stepKey === 'disposition') return <div className="space-y-3"><SelectField label="Disposition" value={d.disposition.kind} options={[{ value: '', label: 'Choose disposition' }, { value: 'home_care', label: 'Discharge / Home care' }, { value: 'observation', label: 'Observation' }, { value: 'referral', label: 'Referral' }, { value: 'admission', label: 'Admission requested' }]} onChange={(e) => setField('disposition', 'kind', e.target.value as typeof d.disposition.kind)} /><TextAreaField label="Care plan / instructions / reason" value={d.disposition.note} onChange={(e) => setField('disposition', 'note', e.target.value)} />{['observation', 'admission'].includes(d.disposition.kind) ? <TextField label="Responsible receiving service" value={d.disposition.responsibleService} onChange={(e) => setField('disposition', 'responsibleService', e.target.value)} /> : null}{d.disposition.kind === 'observation' ? <TextField label="Reassessment due" type="datetime-local" value={d.disposition.reassessOn ? zonedInput(d.disposition.reassessOn, zone) : ''} onChange={(e) => setField('disposition', 'reassessOn', e.target.value ? zonedInstant(e.target.value, zone) : '')} /> : null}{d.disposition.kind === 'referral' ? <TextField label="Destination facility code" value={d.disposition.toFacilityId} onChange={(e) => setField('disposition', 'toFacilityId', e.target.value.toUpperCase())} /> : null}<TextField label="Follow-up date (optional)" type="date" value={d.disposition.followUpOn} onChange={(e) => setField('disposition', 'followUpOn', e.target.value)} />{d.disposition.kind === 'observation' ? <p>Observation remains active until a later disposition is recorded.</p> : d.disposition.kind === 'admission' ? <p>This requests admission; receiving-team acceptance and bed allocation are separate.</p> : null}</div>;

  if (stepKey === 'lab_results') {
    if (d.lab_order.tests.length === 0) {
      return <div className="text-[13px] text-ink-muted">No investigations were ordered for this encounter — skip this step.</div>;
    }
    return (
      <div className="space-y-3">
        {d.lab_order.tests.map((t, index) => (
          <TextField key={d.lab_order.items?.[index]?.id ?? t} label={t} help={H.result} name={`lr_${index}`} value={d.lab_results[d.lab_order.items?.[index]?.id ?? t] || ''} placeholder="Enter result…" onChange={(e) => setResult(d.lab_order.items?.[index]?.id ?? t, e.target.value)} />
        ))}
      </div>
    );
  }

  if (stepKey === 'diagnosis') return <>        <TextField label="Diagnosis" help={H.diagnosis} name="dx" value={d.diagnosis.dx} placeholder="Diagnosis from findings…" onChange={(e) => setField('diagnosis', 'dx', e.target.value)} />
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <TextField label="Diagnosis code (optional)" help={H.diagnosisCode} value={d.diagnosis.code ?? ''} onChange={(e) => setField('diagnosis', 'code', e.target.value)} />
          <SelectField label="Coding system" help={H.codingSystem} value={d.diagnosis.codingSystem ?? ''} options={['', 'ICD-10', 'SNOMED CT', 'local'].map((value) => ({ value, label: value || 'Not coded' }))} onChange={(e) => setField('diagnosis', 'codingSystem', e.target.value ? e.target.value as 'ICD-10' | 'SNOMED CT' | 'local' : undefined)} />
          <SelectField label="Diagnostic certainty" help={H.certainty} value={d.diagnosis.certainty ?? 'unknown'} options={['unknown', 'suspected', 'confirmed'].map((value) => ({ value, label: value }))} onChange={(e) => setField('diagnosis', 'certainty', e.target.value as 'unknown' | 'confirmed' | 'suspected')} />
        </div>
        {(d.diagnosis.diagnoses ?? []).map((diagnosis, index) => <div key={index} className="mt-3 space-y-2 rounded-field border border-outline p-3">
          <TextField label={`Additional diagnosis ${index + 1}`} help={H.additionalDiagnosis} value={diagnosis.label} onChange={(e) => setField('diagnosis', 'diagnoses', d.diagnosis.diagnoses!.map((line, i) => i === index ? { ...line, label: e.target.value } : line))} />
          <TextField label="Code (optional)" help={H.diagnosisCode} value={diagnosis.code ?? ''} onChange={(e) => setField('diagnosis', 'diagnoses', d.diagnosis.diagnoses!.map((line, i) => i === index ? { ...line, code: e.target.value.trim() || undefined } : line))} />
          <SelectField label="Coding system" help={H.codingSystem} value={diagnosis.codingSystem ?? ''} options={['', 'ICD-10', 'SNOMED CT', 'local'].map((value) => ({ value, label: value || 'Not coded' }))} onChange={(e) => setField('diagnosis', 'diagnoses', d.diagnosis.diagnoses!.map((line, i) => i === index ? { ...line, codingSystem: e.target.value ? e.target.value as 'ICD-10' | 'SNOMED CT' | 'local' : undefined } : line))} />
          <SelectField label="Certainty" help={H.certainty} value={diagnosis.certainty ?? 'unknown'} options={['unknown', 'suspected', 'confirmed'].map((value) => ({ value, label: value }))} onChange={(e) => setField('diagnosis', 'diagnoses', d.diagnosis.diagnoses!.map((line, i) => i === index ? { ...line, certainty: e.target.value as 'unknown' | 'confirmed' | 'suspected' } : line))} />
          <Button variant="ghost" onClick={() => setField('diagnosis', 'diagnoses', d.diagnosis.diagnoses!.filter((_, i) => i !== index))}>Remove diagnosis</Button>
        </div>)}
        <Button variant="ghost" onClick={() => setField('diagnosis', 'diagnoses', [...(d.diagnosis.diagnoses ?? []), { label: '', certainty: 'unknown' }])}>Add another diagnosis</Button>
{correcting ? <p className="mt-3 text-sm">This correction changes the diagnosis only. Treatment and disposition are recorded separately.</p> : null}</>;
  if (stepKey === 'prescription') return <><SelectField label="Medication decision" value={d.prescription.decision} options={[{ value: '', label: 'Not yet reviewed' }, { value: 'none_required', label: 'No medication required' }, { value: 'prescribed', label: 'Prescribe medication' }]} onChange={(e) => { setField('prescription', 'decision', e.target.value as typeof d.prescription.decision); if (e.target.value === 'none_required') setField('prescription', 'rx', []); }} />{d.prescription.decision === 'prescribed' ? <>        <div className="mt-4"><FieldLabel label="Prescription" help={H.prescription} /></div>
        <div className="space-y-2">
          {rx.map((m, idx) => (
            <div key={idx} className="flex items-end gap-2.5 rounded-field border border-outline-soft bg-white p-3">
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                <TextField label="Drug" help={H.drug} name={`rx_${idx}_drug`} value={m.name} placeholder="e.g. Artemether-Lumefantrine" onChange={(e) => setRx(idx, 'name', e.target.value)} />
                <TextField label="Dose" help={H.dose} name={`rx_${idx}_dose`} value={m.dose} placeholder="e.g. 1 tablet" onChange={(e) => setRx(idx, 'dose', e.target.value)} />
                <SelectOrTextField label="Frequency" name={`rx_${idx}_frequency`} value={m.frequency ?? ''}
                  options={PRESCRIPTION_FREQUENCIES} help={H.frequency} onChange={(value) => setRx(idx, 'frequency', value)} />
                <SelectOrTextField label="Duration" name={`rx_${idx}_duration`} value={m.duration ?? ''}
                  options={PRESCRIPTION_DURATIONS} help={H.duration} onChange={(value) => setRx(idx, 'duration', value)} />
                <SelectOrTextField label="Route" name={`rx_${idx}_route`} value={m.route ?? ''}
                  options={PRESCRIPTION_ROUTES} help={H.medicationRoute} onChange={(value) => setRx(idx, 'route', value)} />
                <TextField label="Quantity" help={H.quantity} name={`rx_${idx}_quantity`} value={m.quantity ?? ''} inputMode="decimal" onChange={(e) => setRx(idx, 'quantity', e.target.value)} />
              </div>
              <button
                type="button"
                onClick={() => removeRx(idx)}
                aria-label={`Remove ${m.name || 'medication'}`}
                className="flex h-7 w-7 min-h-0 flex-none items-center justify-center rounded-lg bg-surface-muted text-danger-strong"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2">
          <Button variant="outlined" onClick={addRx}>＋ Add medication</Button>
        </div>

</> : null}</>;

  if (stepKey === 'injection') {
    return (
      <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <TextField label="Drug" help={H.injectionDrug} name="inj_drug" value={d.injection.drug} onChange={(e) => setField('injection', 'drug', e.target.value)} />
          <TextField label="Dose" help={H.injectionDose} name="inj_dose" value={d.injection.dose} onChange={(e) => setField('injection', 'dose', e.target.value)} />
          <TextField label="Site" help={H.injectionSite} name="inj_site" value={d.injection.site} onChange={(e) => setField('injection', 'site', e.target.value)} />
        </div>
        <div className="mt-4"><FieldLabel label="Route" help={H.injectionRoute} /></div>
        <div className="flex flex-wrap gap-2">
          {INJECTION_ROUTES.map((r) => (
            <ChoiceChip key={r} selected={d.injection.route === r} onClick={() => setField('injection', 'route', r)}>
              {r}
            </ChoiceChip>
          ))}
        </div>
        <div className="mt-4"><TextAreaField label="Note (optional)" name="injection_note" help={H.injectionNote}
          rows={2} value={d.injection.note} placeholder="Batch identifier, observed reaction or patient tolerance"
          onChange={(event) => setField('injection', 'note', event.target.value)} /></div>
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">The nurse who administers the injection signs this step.</p>
      </>
    );
  }

  if (stepKey === 'dispense') {
    return (
      <>
        <FieldLabel label="Tick each medication as it is handed over" help={H.dispensing} />
        <div className="space-y-2">
          {rx.map((m, idx) => {
            const done = Boolean(d.dispense.done[idx]);
            return (
              <div key={idx} className="space-y-2">
              <FieldLabel label={`${m.name || 'Medication'} supplied`} help={H.dispensing} />
              <button
                type="button"
                onClick={() => ctl.toggleDispense(idx)}
                aria-pressed={done}
                className={`flex w-full items-center gap-3 rounded-field border-[1.5px] p-3 text-left ${done ? 'border-brand bg-brand-wash' : 'border-outline bg-white'}`}
              >
                <span className={`flex h-6 w-6 flex-none items-center justify-center rounded-md border-2 ${done ? 'border-brand bg-brand text-white' : 'border-outline'}`}>
                  {done ? <Icon name="check" className="h-4 w-4" /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold text-ink">{m.name}</span>
                  <span className="block text-[13px] text-ink-muted">{m.dose}</span>
                </span>
              </button>
              {done ? null : (
                <TextField
                  label={`Why ${m.name} was not given`} help={H.notDispensed}
                  name={`dispense_${idx}_reason`}
                  value={d.dispense.reasons[idx] ?? ''}
                  placeholder="e.g. Out of stock"
                  onChange={(e) => setDispenseReason(idx, e.target.value)}
                />
              )}
              </div>
            );
          })}
        </div>
      </>
    );
  }

  // Admission and follow-up belong to the retired visit order; old visits only display them.
  return null;
};
