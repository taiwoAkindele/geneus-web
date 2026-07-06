import { Button, ChoiceChip, Icon, TextField } from '@/ui';
import { COMPLAINT_OPTIONS, FOLLOWUP_OPTIONS, TEST_OPTIONS } from '../steps';
import type { EncounterController } from '../useEncounter';
import type { StepKey } from '../types';

/** The active-state input form for a given section. Reads/writes through the hook. */
export const StepForm = ({ stepKey, ctl }: { stepKey: StepKey; ctl: EncounterController }) => {
  const { enc, setField, toggleIn, setResult, addRx, removeRx } = ctl;
  const d = enc.data;

  if (stepKey === 'vitals') {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <TextField label="Temp (°C)" name="v_temp" value={d.vitals.temp} inputMode="decimal" onChange={(e) => setField('vitals', 'temp', e.target.value)} />
        <TextField label="BP (mmHg)" name="v_bp" value={d.vitals.bp} onChange={(e) => setField('vitals', 'bp', e.target.value)} />
        <TextField label="Pulse (bpm)" name="v_pulse" value={d.vitals.pulse} inputMode="numeric" onChange={(e) => setField('vitals', 'pulse', e.target.value)} />
        <TextField label="Weight (kg)" name="v_weight" value={d.vitals.weight} inputMode="decimal" onChange={(e) => setField('vitals', 'weight', e.target.value)} />
        <TextField label="SpO₂ (%)" name="v_spo2" value={d.vitals.spo2} inputMode="numeric" onChange={(e) => setField('vitals', 'spo2', e.target.value)} />
      </div>
    );
  }

  if (stepKey === 'complaint') {
    return (
      <>
        <div className="mb-2 text-[13px] font-semibold text-ink-soft">Patient's complaints</div>
        <div className="mb-4 flex flex-wrap gap-2">
          {COMPLAINT_OPTIONS.map((c) => {
            const on = d.complaint.complaints.includes(c);
            return (
              <ChoiceChip key={c} selected={on} onClick={() => toggleIn('complaint', 'complaints', c)}>
                {c}{on ? ' ✓' : ''}
              </ChoiceChip>
            );
          })}
        </div>
        <div className="mb-2 text-[13px] font-semibold text-ink-soft">Clinical note</div>
        <textarea
          rows={3}
          value={d.complaint.note}
          onChange={(e) => setField('complaint', 'note', e.target.value)}
          className="w-full rounded-field border-[1.5px] border-outline bg-white p-3.5 text-[15px] leading-relaxed text-ink outline-none focus:border-2 focus:border-brand"
        />
      </>
    );
  }

  if (stepKey === 'laborder') {
    return (
      <>
        <div className="mb-2 text-[13px] font-semibold text-ink-soft">Investigations to order</div>
        <div className="flex flex-wrap gap-2">
          {TEST_OPTIONS.map((t) => {
            const on = d.laborder.tests.includes(t);
            return (
              <ChoiceChip key={t} selected={on} onClick={() => toggleIn('laborder', 'tests', t)}>
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

  if (stepKey === 'labresults') {
    if (d.laborder.tests.length === 0) {
      return <div className="text-[13px] text-ink-muted">No investigations were ordered for this encounter.</div>;
    }
    return (
      <div className="space-y-3">
        {d.laborder.tests.map((t) => (
          <TextField key={t} label={t} name={`lr_${t}`} value={d.labresults[t] || ''} placeholder="Enter result…" onChange={(e) => setResult(t, e.target.value)} />
        ))}
      </div>
    );
  }

  if (stepKey === 'diagnosis') {
    return (
      <>
        <TextField label="Diagnosis" name="dx" value={d.diagnosis.dx} placeholder="Diagnosis from findings…" onChange={(e) => setField('diagnosis', 'dx', e.target.value)} />
        <div className="mb-2 mt-4 text-[13px] font-semibold text-ink-soft">Prescription</div>
        <div className="space-y-2">
          {d.diagnosis.rx.map((m, idx) => (
            <div key={idx} className="flex items-center gap-2.5 rounded-field border border-outline-soft bg-white p-3">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold text-ink">{m.name}</div>
                <div className="text-[13px] text-ink-muted">{m.dose}</div>
              </div>
              <button
                type="button"
                onClick={() => removeRx(idx)}
                aria-label={`Remove ${m.name}`}
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
      </>
    );
  }

  if (stepKey === 'dispense') {
    return (
      <>
        <div className="mb-2 text-[13px] font-semibold text-ink-soft">Tick each medication as it is handed over</div>
        <div className="space-y-2">
          {d.diagnosis.rx.map((m, idx) => {
            const done = Boolean(d.dispense.done[idx]);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => ctl.toggleDispense(idx)}
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
            );
          })}
        </div>
      </>
    );
  }

  // followup
  return (
    <>
      <div className="mb-2 text-[13px] font-semibold text-ink-soft">Book a follow-up</div>
      <div className="mb-4 flex flex-wrap gap-2">
        {FOLLOWUP_OPTIONS.map((o) => (
          <ChoiceChip key={o} selected={d.followup.when === o} onClick={() => setField('followup', 'when', o)}>
            {o}
          </ChoiceChip>
        ))}
      </div>
      <TextField label="Reason for review" name="fu_reason" value={d.followup.reason} onChange={(e) => setField('followup', 'reason', e.target.value)} />
      <div className="mt-4 rounded-card border border-amber-border bg-amber-bg p-3.5 text-[13px] leading-relaxed text-amber-text">
        Saving this step <b>closes the encounter</b> — every section becomes permanent. The follow-up is added to the
        appointments list for the chosen day.
      </div>
    </>
  );
};
