import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { yearsBetween, type Patient } from '@shared';
import { getPatient, updatePatient } from '@/data/repos/patients';
import { fromPatient, toPatientDetails, type RegistrationValues } from '@/features/registration/registrationValues';
import { useAuthorizationContext } from '@/session';
import { currentAge } from '@/features/search';
import { Button, SelectField, Sheet, SheetCancelButton, TextAreaField, TextField, useToast } from '@/ui';
import { calendarDate } from '@/lib/calendarDate';
import { PatientIdentityPanel } from './PatientIdentityPanel';

export const PersonalDetails = ({ patient, canEdit, onEdit, onPrint }: { patient: Patient; canEdit: boolean; onEdit: () => void; onPrint: () => void }) => <section className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-2xl font-extrabold">Personal details</h2><p className="mt-1 text-sm text-ink-soft">Administrative information about the patient.</p></div><div className="flex flex-wrap gap-2"><Button variant="outlined" fullWidth={false} onClick={onPrint}>Print patient card</Button>{canEdit ? <Button fullWidth={false} onClick={onEdit}>Edit personal details</Button> : null}</div></div>
  {[
    { title: 'Identification', fields: [['Patient ID', patient.patientId], ['Full name', patient.fullName], ['Sex', patient.sex === 'female' ? 'Female' : 'Male'], ['Age', currentAge(patient) === undefined ? 'Not recorded' : `${currentAge(patient)} years${patient.dobEstimated || !patient.dateOfBirth ? ' · estimated' : ''}`], ['Date of birth', patient.dateOfBirth ?? 'Not recorded']] },
    { title: 'Contact', fields: [['Phone', patient.phone ?? 'Not recorded'], ['Address', patient.address]] },
    { title: 'Additional details', fields: [['Occupation', patient.occupation ?? 'Not recorded'], ['Religion', patient.religion ?? 'Not recorded'], ['Old folder number', patient.legacyPaperRef ?? 'Not recorded'], ...(canEdit ? [['NIN', patient.nin ? `•••••••${patient.nin.slice(-4)}` : 'Not provided']] : []), ['Identity information', patient.identityEvidence === 'document_seen' ? 'Identity document checked by staff' : 'Reported by patient / representative'], ...(canEdit && patient.identityEvidenceNote ? [['Evidence checked', patient.identityEvidenceNote]] : []), ['Registered', new Date(patient.createdOn).toLocaleDateString('en-GB')]] },
  ].map((section) => <section key={section.title} className="overflow-hidden rounded-field border border-outline-soft"><h3 className="bg-brand-wash px-4 py-3 font-bold text-brand">{section.title}</h3><dl className="divide-y divide-outline-soft">{section.fields.map(([label, value]) => <div key={label} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[180px_1fr]"><dt className="font-semibold text-ink-soft">{label}</dt><dd className="break-words">{value}</dd></div>)}</dl></section>)}
  <PatientIdentityPanel patientId={patient.patientId} />
</section>;

export const PersonalDetailsEditor = ({ patient, onClose, onSaved }: { patient: Patient; onClose: () => void; onSaved: () => void }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const initial = useRef(fromPatient(patient));
  const [error, setError] = useState('');
  const { register, handleSubmit, watch, setValue, formState: { isDirty, isSubmitting, errors } } = useForm<RegistrationValues>({ defaultValues: initial.current });
  const evidence = watch('identityEvidence');
  const save = handleSubmit(async (form) => {
    setError('');
    try {
      if (!form.age.trim() && !form.dateOfBirth) throw new Error('Record an age or date of birth');
      const latest = await getPatient(patient.patientId);
      if (!latest) throw new Error('The patient could not be read. Your changes are still here.');
      const latestForm = fromPatient(latest);
      const merged = { ...latestForm };
      const changed = (Object.keys(form) as (keyof RegistrationValues)[]).filter((key) => form[key] !== initial.current[key]);
      for (const key of changed) {
        if (latestForm[key] !== initial.current[key]) throw new Error('These details changed while you were editing. Keep your changes and review the current record before saving.');
        Object.assign(merged, { [key]: form[key] });
      }
      const details = toPatientDetails(merged);
      if (!changed.includes('religion')) details.religion = latest.religion;
      await updatePatient(patient.patientId, details, context);
      toast('Patient details updated on this device'); onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save. Your changes are still here.'); }
  });
  return <Sheet title="Edit personal details" eyebrow={patient.patientId} placement="side" onClose={onClose} closeDisabled={isSubmitting} hasUnsavedChanges={isDirty}>
    <form noValidate onSubmit={save} className="space-y-4">
      <TextField label="Full name" required {...register('fullName', { validate: (value) => Boolean(value.trim()) || 'Enter the patient’s name' })} error={errors.fullName?.message} />
      <div className="grid grid-cols-2 gap-3"><SelectField label="Sex" {...register('sex', { required: 'Choose sex' })} options={[{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }]} /><TextField label="Age" type="number" min="0" max="130" {...register('age')} help={{ purpose: 'Use an estimated age when the birth date is unknown. If both are recorded, they must agree.' }} /></div>
      <TextField label="Date of birth" type="date" max={calendarDate()} {...register('dateOfBirth', { onChange: (event) => { const date = String(event.target.value); if (date && date <= calendarDate()) setValue('age', String(yearsBetween(date, calendarDate())), { shouldDirty: true }); } })} />
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" {...register('dobEstimated')} className="h-5 w-5 min-h-0" />Age / birth date is estimated</label>
      {!watch('dateOfBirth') ? <p className="text-sm text-ink-soft">Without a birth date, the recorded age is treated as an estimate.</p> : null}
      <TextField label="Phone" type="tel" {...register('phone')} />
      <TextAreaField label="Address" required {...register('address', { validate: (value) => Boolean(value.trim()) || 'Enter an address' })} error={errors.address?.message} />
      <details className="rounded-field border border-outline-soft p-3"><summary className="cursor-pointer font-bold">Additional details</summary><div className="mt-4 space-y-4"><p className="text-sm text-ink-soft">Optional details are kept when you save.</p>
        <TextField label="Occupation" {...register('occupation')} /><SelectField label="Religion" {...register('religion')} options={[{ value: '', label: 'Not recorded' }, { value: 'christianity', label: 'Christianity' }, { value: 'islam', label: 'Islam' }, { value: 'other', label: 'Other' }]} />
        <TextField label="Old folder / card number" {...register('folder')} /><TextField label="NIN (optional)" inputMode="numeric" autoComplete="off" {...register('nin')} help={{ purpose: 'Optional identity information. An NIN is not required for care.' }} />
        <SelectField label="Identity information" {...register('identityEvidence')} options={[{ value: 'reported', label: 'Reported by patient / representative' }, { value: 'document_seen', label: 'Staff checked an identity document' }]} />
        {evidence === 'document_seen' ? <TextField label="Evidence checked" {...register('identityEvidenceNote')} hint="Document type and what was checked. Do not copy the full identifier." /> : null}
      </div></details>
      {isDirty ? <p className="rounded-field bg-amber-bg p-3 text-sm text-amber-text">Unsaved changes</p> : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" loading={isSubmitting}>Save changes</Button><SheetCancelButton disabled={isSubmitting} />
      <p className="text-sm text-ink-soft">Updates are recorded with your name and time.</p>
    </form>
  </Sheet>;
};
