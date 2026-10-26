import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { SPECIALTY_FIELDS, type ClinicalEvent, type ClinicalKind } from '@shared';
import { saveClinicalRecord } from '@/data/repos/clinical';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, Sheet, TextAreaField, TextField, useToast } from '@/ui';
import { CLINICAL_FIELDS, CLINICAL_LABELS, clinicalFormDefaults, clinicalFormValues } from './clinicalForms';
import { clinicalFieldHelp, SPECIALTY_MEASUREMENT_HELP } from './fieldHelp';

type Props = { patientId: string; kind: ClinicalKind; previous?: ClinicalEvent; initial?: Record<string, unknown>; encounterId?: string; problems: ClinicalEvent[]; onClose: () => void };
export const ClinicalRecordSheet = ({ patientId, kind, previous, initial, encounterId, problems, onClose }: Props) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  const { register, handleSubmit, watch } = useForm<Record<string, string>>({ defaultValues: clinicalFormDefaults(kind, previous, initial) });
  const specialty = watch('specialty') as keyof typeof SPECIALTY_FIELDS;
  const save = handleSubmit(async (form) => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try {
      await saveClinicalRecord(previous?.patientId ?? patientId, kind, clinicalFormValues(kind, form), context, previous, encounterId);
      toast(previous ? 'Clinical revision saved with your name and time' : 'Clinical record saved'); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Your entries are still here.'); }
    finally { busy.current = false; setSaving(false); }
  });
  return <Sheet title={CLINICAL_LABELS[kind]} onClose={onClose} closeDisabled={saving}>
    <form onSubmit={save} className="space-y-4">
      <p className="text-sm text-ink-muted">{previous ? 'Save a new version. Earlier versions remain in the clinical history.' : 'Review your entries before saving permanently.'}</p>
      <fieldset disabled={saving} className="space-y-4">
        {CLINICAL_FIELDS[kind].map((field) => field.options ? <SelectField key={field.key} label={field.label} help={clinicalFieldHelp(kind, field.key)} {...register(field.key)} options={field.options.map((value) => ({ value, label: value || 'Not recorded' }))} /> : field.type === 'textarea' ?
          <TextAreaField key={field.key} label={field.label} help={clinicalFieldHelp(kind, field.key)} {...register(field.key)} required={field.required} /> :
          <TextField key={field.key} label={field.label} help={clinicalFieldHelp(kind, field.key)} {...register(field.key)} type={field.type ?? 'text'} required={field.required} />)}
        {kind === 'medication' || kind === 'care_plan' ? <SelectField label="Related problem" help={clinicalFieldHelp(kind, 'problemId')} {...register('problemId')} options={[{ value: '', label: 'No linked problem' }, ...problems.filter((p) => p.patientId === (previous?.patientId ?? patientId)).map((p) => ({ value: p.recordId, label: String(p.values.label) }))]} /> : null}
        {kind === 'specialty' ? (SPECIALTY_FIELDS[specialty] ?? []).map((label) => <TextField key={label} label={label} help={SPECIALTY_MEASUREMENT_HELP[label]} {...register(`measurement_${label}`)} />) : null}
      </fieldset>
      {kind === 'care_plan' || kind === 'specialty' ? <p className="text-xs text-ink-muted">A review date records the care plan. Use Book appointment on the patient profile to reserve a visit.</p> : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" loading={saving} disabled={saving}>Save permanently</Button>
      <Button variant="outlined" disabled={saving} onClick={onClose}>Cancel</Button>
    </form>
  </Sheet>;
};
