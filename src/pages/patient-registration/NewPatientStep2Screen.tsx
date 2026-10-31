import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AppBar, Button, ChoiceChip, SegmentedControl, TextField } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { listPatients } from '@/data/repos/patients';
import {
  useRegistrationDraft,
  toPatientDetails,
  useNextPatientNumber,
  useSavePatient,
  type RegistrationNavState,
  type RegistrationValues,
} from '@/features/registration';
import { findLikelyMatches } from '@/features/search';
import type { DuplicateNavState } from './DuplicateCheckScreen';
import { RegistrationRecoveryGate, RegistrationRecoveryStatus } from '@/features/registration/RegistrationRecoveryPrompt';

const OCCUPATIONS = ['Trader', 'Farmer', 'Student', 'Civil servant', 'Artisan'];

type Step2Values = Pick<RegistrationValues, 'occupation' | 'religion' | 'folder' | 'nin' | 'identityEvidence' | 'identityEvidenceNote'>;

/**
 * 4.4 New patient — step 2. Occupation, religion & old folder number, then the
 * save: a new patient is first checked against everyone on the device, and a
 * likely match asks "Is this the same person?" before anything is written
 * (PRD §10); otherwise they get a Patient ID minted here, offline (§10.1). An
 * edit saves only what changed. Nothing is pre-chosen — a default would record
 * an answer the patient never gave.
 */
const Step2Form = ({ state }: { state: NonNullable<RegistrationNavState> }) => {
  const navigate = useNavigate();
  const savePatient = useSavePatient();
  const nextNumber = useNextPatientNumber();
  const { values, keep } = useRegistrationDraft(state);
  const editing = Boolean(state.patientId);
  const [saveError, setSaveError] = useState('');

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting, errors },
  } = useForm<Step2Values>({ defaultValues: values });
  const occupation = watch('occupation');
  useEffect(() => {
    const subscription = watch((partial) => keep(partial));
    return () => subscription.unsubscribe();
  }, [watch, keep]);

  const save = async (step2: Step2Values) => {
    setSaveError('');
    const complete = { ...values, ...step2 };
    keep(step2);
    try {
    toPatientDetails(complete);
    if (state.patientId) return savePatient(complete, state.patientId);

    const matches = findLikelyMatches(toPatientDetails(complete), await listPatients());
    if (matches.length > 0) {
      const duplicate: DuplicateNavState = { matchIds: matches.map((match) => match.patient.patientId) };
      return navigate('/patients/duplicate', { state: duplicate });
    }
    return savePatient(complete);
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : 'The duplicate check could not be completed. Try again.'); }
  };

  if (!values.fullName || !values.sex || !values.address || (!values.age && !values.dateOfBirth)) return <Navigate to="/patients/new" state={{ patientId: state.patientId }} replace />;

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar
        title={editing ? 'Edit patient' : 'New patient'}
        onBack={() => navigate(-1)}
        right={
          <div className="flex items-center gap-2">
            <SyncPill />
            <span className="font-mono text-[11px] text-ink-muted">Step 2 of 2</span>
          </div>
        }
      />
      <form
        noValidate
        onSubmit={handleSubmit(save)}
        className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg lg:my-8 lg:min-h-0 lg:flex-none lg:overflow-hidden lg:rounded-card lg:border lg:border-outline-soft lg:bg-white lg:shadow-card"
      >
        <div className="flex-1 space-y-4 px-5 py-3">
          <RegistrationRecoveryStatus />
          <div>
            <TextField label="Occupation" placeholder="e.g. Trader" autoComplete="off" {...register('occupation')} />
            <div className="mt-2.5 flex flex-wrap gap-2">
              {OCCUPATIONS.map((o) => (
                <ChoiceChip
                  key={o}
                  selected={occupation === o}
                  onClick={() => setValue('occupation', occupation === o ? '' : o)}
                >
                  {o}
                  {occupation === o ? ' ✓' : ''}
                </ChoiceChip>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[13px] font-semibold text-ink-soft">Religion</div>
            <Controller
              control={control}
              name="religion"
              render={({ field }) => (
                <SegmentedControl
                  ariaLabel="Religion"
                  value={field.value}
                  onChange={(religion) => field.onChange(field.value === religion ? '' : religion)}
                  options={[
                    { value: 'christianity', label: 'Christianity' },
                    { value: 'islam', label: 'Islam' },
                    { value: 'other', label: 'Other' },
                  ]}
                />
              )}
            />
          </div>

          <TextField
            label="Old folder / card number"
            hint="Optional — kept so nothing from the paper file is lost"
            placeholder="e.g. paper file 2023/1187"
            autoComplete="off"
            {...register('folder')}
          />
          <TextField label="NIN (optional)" inputMode="numeric" autoComplete="off" hint="11 digits. Registration does not require a NIN." error={errors.nin?.message} {...register('nin', { validate: (value) => !value.trim() || /^\d{11}$/.test(value.replace(/\s/g, '')) || 'Enter 11 digits or leave blank' })} />
          <label className="block text-sm font-semibold">Identity information
            <select className="mt-2 w-full rounded-field border border-outline bg-white p-3" {...register('identityEvidence')}>
              <option value="reported">Reported by patient / representative</option>
              <option value="document_seen">Staff checked an identity document</option>
            </select>
          </label>
          {watch('identityEvidence') === 'document_seen' ? <TextField label="Evidence checked" hint="Document type and what was checked. Do not copy the full identifier here." error={errors.identityEvidenceNote?.message} {...register('identityEvidenceNote', { validate: (value) => watch('identityEvidence') !== 'document_seen' || Boolean(value.trim()) || 'Describe the evidence checked' })} /> : null}
          <p className="text-xs text-ink-muted">A checked document is a staff observation, not verification by an identity provider.</p>

          {/* Patient ID preview — only when creating; an existing patient keeps its ID. */}
          {!editing && nextNumber ? (
            <div className="rounded-[14px] bg-brand-tint px-4 py-3.5">
              <div className="text-xs text-brand-strong">A Patient ID will be created</div>
              <div className="mt-0.5 font-mono text-lg font-semibold text-brand">
                {nextNumber}-<span className="opacity-50">••</span>
              </div>
            </div>
          ) : null}
        </div>

        <footer className="border-t border-outline-soft bg-surface px-5 pb-6 pt-4">
          {saveError ? <p role="alert" className="mb-3 text-sm text-danger">{saveError}</p> : null}
          <Button variant="primary" type="submit" disabled={isSubmitting} loading={isSubmitting}>
            {editing ? 'Save changes' : 'Register patient'}
          </Button>
        </footer>
      </form>
    </div>
  );
};

export const NewPatientStep2Screen = () => {
  const state = (useLocation().state as RegistrationNavState) ?? {};
  return <RegistrationRecoveryGate key={state.patientId ?? 'new'} draftKey={state.patientId ?? 'new'}><Step2Form key={state.patientId ?? 'new'} state={state} /></RegistrationRecoveryGate>;
};
