import { Button, ChoiceChip, FieldLabel, Icon, SelectField, SelectOrTextField, TextAreaField, TextField } from '@/ui';
import { ENCOUNTER_FIELD_HELP as H, PRESCRIPTION_DURATIONS, PRESCRIPTION_FREQUENCIES, PRESCRIPTION_ROUTES } from '../fieldHelp';
import { followUpOptions, INJECTION_ROUTES, TEST_OPTIONS, WARD_OPTIONS } from '../steps';
import type { EncounterController } from '../useEncounter';
import type { StepKey } from '../types';
export type StepFormController = Pick<EncounterController, 'setField' | 'toggleIn' | 'setResult' | 'addRx' | 'setRx' | 'removeRx' | 'setDispenseReason' | 'toggleDispense'> & { enc: Pick<EncounterController['enc'], 'data'> };

/** The active-state input form for a given section. Reads/writes through the hook. */
export const StepForm = ({ stepKey, ctl, correcting = false }: { stepKey: StepKey; ctl: StepFormController; correcting?: boolean }) => {
  const { enc, setField, toggleIn, setResult, addRx, setRx, removeRx, setDispenseReason } = ctl;
  const d = enc.data;

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

  if (stepKey === 'lab_order') {
    return (
      <>
        <FieldLabel label="Investigations to order" help={H.investigations} />
        <div className="flex flex-wrap gap-2">
          {TEST_OPTIONS.map((t) => {
            const on = d.lab_order.tests.includes(t);
            return (
              <ChoiceChip key={t} selected={on} onClick={() => toggleIn('lab_order', 'tests', t)}>
                {t}{on ? ' ✓' : ''}
              </ChoiceChip>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">
          The lab attendant sees exactly these orders on the patient's record and enters results against them.
        </p>
      </>
    );
  }

  if (stepKey === 'lab_results') {
    if (d.lab_order.tests.length === 0) {
      return <div className="text-[13px] text-ink-muted">No investigations were ordered for this encounter — skip this step.</div>;
    }
    return (
      <div className="space-y-3">
        {d.lab_order.tests.map((t) => (
          <TextField key={t} label={t} help={H.result} name={`lr_${t}`} value={d.lab_results[t] || ''} placeholder="Enter result…" onChange={(e) => setResult(t, e.target.value)} />
        ))}
      </div>
    );
  }

  if (stepKey === 'diagnosis') {
    return (
      <>
        <TextField label="Diagnosis" help={H.diagnosis} name="dx" value={d.diagnosis.dx} placeholder="Diagnosis from findings…" onChange={(e) => setField('diagnosis', 'dx', e.target.value)} />
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
        <div className="mt-4"><FieldLabel label="Prescription" help={H.prescription} /></div>
        <div className="space-y-2">
          {d.diagnosis.rx.map((m, idx) => (
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

        {correcting ? <p className="mt-4 text-sm text-ink-muted">The saved disposition stays unchanged. Medication changes after dispensing belong in medication reconciliation.</p> : <><div className="mt-5"><FieldLabel label="Plan / disposition" help={H.disposition} /></div>
        <div className="flex flex-wrap gap-2">
          <ChoiceChip selected={d.diagnosis.injection} onClick={() => setField('diagnosis', 'injection', !d.diagnosis.injection)}>
            Give injection{d.diagnosis.injection ? ' ✓' : ''}
          </ChoiceChip>
          <ChoiceChip selected={d.diagnosis.admit} onClick={() => setField('diagnosis', 'admit', !d.diagnosis.admit)}>
            Admit patient{d.diagnosis.admit ? ' ✓' : ''}
          </ChoiceChip>
        </div>
        <p className="mt-2.5 text-xs leading-relaxed text-ink-muted">
          Prescribing adds a pharmacy step. Injection adds a nurse-administered step. Admitting keeps the patient as an
          inpatient instead of closing with a follow-up — the matching sections appear below once you lock this step.
        </p>
        </>}
      </>
    );
  }

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

  if (stepKey === 'admission') {
    return (
      <>
        <FieldLabel label="Ward" help={H.ward} />
        <div className="mb-4 flex flex-wrap gap-2">
          {WARD_OPTIONS.map((w) => (
            <ChoiceChip key={w} selected={d.admission.ward === w} onClick={() => setField('admission', 'ward', w)}>
              {w}
            </ChoiceChip>
          ))}
        </div>
        <TextField label="Bed" help={H.bed} name="ad_bed" value={d.admission.bed} onChange={(e) => setField('admission', 'bed', e.target.value)} />
        <div className="mt-4"><FieldLabel label="Admitting diagnosis" help={H.admittingDiagnosis} /></div>
        <div className="rounded-field bg-surface-muted px-3.5 py-3 text-[15px] font-semibold text-ink">{d.diagnosis.dx || '—'}</div>
        <div className="mt-4"><TextAreaField label="Admitting note" name="admission_note" help={H.admissionNote}
          value={d.admission.note} placeholder={`Example: ${H.admissionNote.example}`}
          onChange={(event) => setField('admission', 'note', event.target.value)} /></div>
        <div className="mt-4 rounded-card border border-slate-bg bg-slate-bg p-3.5 text-[13px] leading-relaxed text-slate-text">
          Saving this step <b>admits the patient</b> and locks the encounter as an inpatient episode — no follow-up is
          booked. The patient shows as admitted on their profile.
        </div>
      </>
    );
  }

  if (stepKey === 'dispense') {
    return (
      <>
        <FieldLabel label="Tick each medication as it is handed over" help={H.dispensing} />
        <div className="space-y-2">
          {d.diagnosis.rx.map((m, idx) => {
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

  // follow_up
  return (
    <>
      <FieldLabel label="Book a follow-up" help={H.followUp} />
      <div className="mb-4 flex flex-wrap gap-2">
        {followUpOptions().map((o) => (
          <ChoiceChip key={o.label} selected={d.follow_up.when === o.value} onClick={() => setField('follow_up', 'when', o.value)}>
            {o.label}
          </ChoiceChip>
        ))}
      </div>
      <TextField label="Other review date" help={H.reviewDate} type="date" name="follow_up_date" value={d.follow_up.when} onChange={(e) => setField('follow_up', 'when', e.target.value)} />
      <TextField label="Reason for review" help={H.reviewReason} name="fu_reason" value={d.follow_up.reason} onChange={(e) => setField('follow_up', 'reason', e.target.value)} />
      <div className="mt-4 rounded-card border border-amber-border bg-amber-bg p-3.5 text-[13px] leading-relaxed text-amber-text">
        Saving this step <b>closes the encounter</b> — every section becomes permanent. A follow-up is added to the
        appointments list for the chosen day.
      </div>
    </>
  );
};
