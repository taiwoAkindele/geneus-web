import { Controller, useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppBar, Button, ChoiceChip, SegmentedControl, TextField } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { listPatients } from '@/data/repos/patients';
import {
  EMPTY_REGISTRATION,
  toPatientDetails,
  useNextPatientNumber,
  useSavePatient,
  type RegistrationNavState,
  type RegistrationValues,
} from '@/features/registration';
import { findLikelyMatches } from '@/features/search';
import type { DuplicateNavState } from './DuplicateCheckScreen';

const OCCUPATIONS = ['Trader', 'Farmer', 'Student', 'Civil servant', 'Artisan'];

type Step2Values = Pick<RegistrationValues, 'occupation' | 'religion' | 'folder'>;

/**
 * 4.4 New patient — step 2. Occupation, religion & old folder number, then the
 * save: a new patient is first checked against everyone on the device, and a
 * likely match asks "Is this the same person?" before anything is written
 * (PRD §10); otherwise they get a Patient ID minted here, offline (§10.1). An
 * edit saves only what changed. Nothing is pre-chosen — a default would record
 * an answer the patient never gave.
 */
export const NewPatientStep2Screen = () => {
  const navigate = useNavigate();
  const savePatient = useSavePatient();
  const nextNumber = useNextPatientNumber();
  const state = (useLocation().state as RegistrationNavState) ?? {};
  const values = { ...EMPTY_REGISTRATION, ...state.values };
  const editing = Boolean(state.patientId);

  const {
    control,
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { isSubmitting },
  } = useForm<Step2Values>({ defaultValues: values });
  const occupation = watch('occupation');

  const save = async (step2: Step2Values) => {
    const complete = { ...values, ...step2 };
    if (state.patientId) return savePatient(complete, state.patientId);

    const matches = findLikelyMatches(toPatientDetails(complete), await listPatients());
    if (matches.length > 0) {
      const duplicate: DuplicateNavState = { values: complete, matchIds: matches.map((match) => match.patient.patientId) };
      return navigate('/patients/duplicate', { state: duplicate });
    }
    return savePatient(complete);
  };

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
          <Button variant="primary" type="submit" disabled={isSubmitting} loading={isSubmitting}>
            {editing ? 'Save changes' : 'Register patient'}
          </Button>
        </footer>
      </form>
    </div>
  );
};
