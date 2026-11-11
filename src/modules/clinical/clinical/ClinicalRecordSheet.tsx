import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { CLINICAL_VALUES, SPECIALTY_FIELDS, type ClinicalEvent, type ClinicalKind } from '@shared';
import { saveClinicalRecord } from '@/data/repos/clinical';
import { useAuthorizationContext, useSession } from '@/session';
import { Button, SelectField, Sheet, SheetCancelButton, TextAreaField, TextField, useToast } from '@/ui';
import { CLINICAL_FIELDS, CLINICAL_LABELS, clinicalFormDefaults, clinicalFormValues, type ClinicalField } from './clinicalForms';
import { clinicalFieldHelp, SPECIALTY_MEASUREMENT_HELP } from './fieldHelp';

type Props = { patientId: string; kind: ClinicalKind; previous?: ClinicalEvent; initial?: Record<string, unknown>; encounterId?: string; problems: ClinicalEvent[]; onClose: () => void };
export const ClinicalRecordSheet = ({ patientId, kind, previous, initial, encounterId, problems, onClose }: Props) => {
  const context = useAuthorizationContext();
  const { user } = useSession();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState<Record<string, string>>();
  const { register, handleSubmit, watch, formState: { isDirty, errors } } = useForm<Record<string, string>>({ defaultValues: clinicalFormDefaults(kind, previous, initial) });
  const specialty = watch('specialty') as keyof typeof SPECIALTY_FIELDS;
  const extraProblemFields = ['code', 'codingSystem', 'resolvedOn'];
  const renderField = (field: ClinicalField) => {
    const bind = register(field.key, { required: field.required ? 'Enter ' + field.label.toLowerCase() : false });
    const feedback = errors[field.key]?.message;
    return field.options ? <SelectField key={field.key} label={field.label} help={clinicalFieldHelp(kind, field.key)} {...bind} error={feedback} options={field.options.map((value) => ({ value, label: value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Not recorded' }))} /> : field.type === 'textarea' ?
      <TextAreaField key={field.key} label={field.label} help={clinicalFieldHelp(kind, field.key)} {...bind} required={field.required} error={feedback} /> :
      <TextField key={field.key} label={field.label} help={clinicalFieldHelp(kind, field.key)} {...bind} type={field.type ?? 'text'} required={field.required} error={feedback} />;
  };
  const prepare = handleSubmit((form) => {
    const result = CLINICAL_VALUES[kind].safeParse(clinicalFormValues(kind, form));
    if (!result.success) { setError(result.error.issues.map((issue) => issue.message).join(' · ')); return; }
    setError(''); setReview({ ...form });
  });
  const save = async () => {
    if (busy.current || !review) return;
    busy.current = true; setSaving(true); setError('');
    try {
      await saveClinicalRecord(previous?.patientId ?? patientId, kind, clinicalFormValues(kind, review), context, previous, encounterId);
      toast(previous ? 'Clinical revision signed and saved on this device' : 'Clinical record signed and saved on this device'); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Your entries are still here.'); }
    finally { busy.current = false; setSaving(false); }
  };
  return <Sheet title={review ? 'Review clinical entry' : CLINICAL_LABELS[kind]} eyebrow={previous ? 'Review / update · earlier versions stay in the chart' : 'New clinical record'} placement="side" onClose={onClose} closeDisabled={saving} hasUnsavedChanges={isDirty || Boolean(review)}>
    {review ? <div className="space-y-4">
      <p className="text-sm text-ink-soft">Confirm what will be signed by {user.name}. The date and time are recorded automatically.</p>
      <dl className="divide-y divide-outline-soft text-sm">{Object.entries(clinicalFormValues(kind, review)).map(([key, value]) => <div key={key} className="py-3"><dt className="font-bold">{CLINICAL_FIELDS[kind].find((field) => field.key === key)?.label ?? (key === 'problemId' ? 'Related problem' : 'Measurements')}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{key === 'problemId' ? String(problems.find((problem) => problem.recordId === value)?.values.label ?? value) : typeof value === 'object' && value !== null ? Object.entries(value).map(([label, measurement]) => label + ': ' + String(measurement)).join('; ') : String(value)}</dd></div>)}</dl>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button onClick={() => void save()} loading={saving}>Save permanently</Button>
      <Button variant="outlined" disabled={saving} onClick={() => setReview(undefined)}>Keep editing</Button>
    </div> : <form onSubmit={prepare} noValidate className="space-y-4">
      <p className="text-sm text-ink-soft">{previous ? 'Save a new signed version. Earlier versions remain in the clinical history.' : 'Review your entries before signing permanently.'}</p>
      <fieldset disabled={saving} className="space-y-4">
        {CLINICAL_FIELDS[kind].filter((field) => kind !== 'problem' || !extraProblemFields.includes(field.key)).map(renderField)}
        {kind === 'problem' ? <details open={Boolean(previous?.values.code || previous?.values.resolvedOn || watch('status') === 'resolved')} className="rounded-field border border-outline-soft p-3">
          <summary className="cursor-pointer text-sm font-bold">Coding & resolution details (optional)</summary>
          <div className="mt-4 space-y-4">{CLINICAL_FIELDS.problem.filter((field) => extraProblemFields.includes(field.key)).map(renderField)}</div>
        </details> : null}
        {kind === 'medication' || kind === 'care_plan' ? <SelectField label="Related problem" help={clinicalFieldHelp(kind, 'problemId')} {...register('problemId')} options={[{ value: '', label: 'No linked problem' }, ...problems.filter((p) => p.patientId === (previous?.patientId ?? patientId)).map((p) => ({ value: p.recordId, label: String(p.values.label) }))]} /> : null}
        {kind === 'specialty' ? (SPECIALTY_FIELDS[specialty] ?? []).map((label) => <TextField key={label} label={label} help={SPECIALTY_MEASUREMENT_HELP[label]} {...register('measurement_' + label)} />) : null}
      </fieldset>
      {kind === 'care_plan' || kind === 'specialty' ? <p className="text-sm text-ink-soft">A review date records the care plan. Use Book appointment on the patient record to reserve a visit.</p> : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" loading={saving}>{previous ? 'Review & sign update' : 'Review & sign entry'}</Button>
      <SheetCancelButton disabled={saving} />
    </form>}
  </Sheet>;
};
