import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AppBar, Button, SegmentedControl, TextField } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { calendarDate } from '@/lib/calendarDate';
import { validCalendarDate, yearsBetween } from '@shared';
import { EMPTY_REGISTRATION, useRegistrationDraft, type RegistrationNavState, type RegistrationValues } from '@/features/registration';
import { RegistrationRecoveryGate, RegistrationRecoveryStatus } from '@/features/registration/RegistrationRecoveryPrompt';

const todayIso = (): string => calendarDate();

type Step1Values = Pick<RegistrationValues, 'fullName' | 'sex' | 'age' | 'dateOfBirth' | 'phone' | 'address' | 'dobEstimated'>;

/**
 * 4.3 New patient — step 1. Only the fields Nigerian facilities already use.
 * Nothing is saved yet: the values travel to step 2, which saves. Reused for
 * editing — opened with the patient's values and id from their profile.
 */
const Step1Form = ({ state }: { state: NonNullable<RegistrationNavState> }) => {
  const navigate = useNavigate();
  const { values, keep, clear } = useRegistrationDraft(state);
  const editing = Boolean(state.patientId);

  const {
    control,
    register,
    handleSubmit,
    getValues,
    watch,
    reset,
    formState: { errors },
  } = useForm<Step1Values>({ defaultValues: values });

  useEffect(() => {
    const subscription = watch((partial) => keep(partial));
    return () => subscription.unsubscribe();
  }, [watch, keep]);

  const next = (step1: Step1Values) => {
    keep(step1);
    navigate('/patients/new/details', { state: { patientId: state.patientId } satisfies RegistrationNavState });
  };

  // Age or date of birth: an elderly patient with no records still gets registered (PRD §10).
  const ageOrBirth = () => (getValues('age').trim() || getValues('dateOfBirth') ? true : 'Give an age or a date of birth');

  if (editing && (!values.fullName || !values.sex)) return <Navigate to="/patients/profile" state={{ patientId: state.patientId }} replace />;

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar
        title={editing ? 'Edit patient' : 'New patient'}
        onBack={() => navigate(-1)}
        right={
          <div className="flex items-center gap-2">
            <SyncPill />
            <span className="font-mono text-[11px] text-ink-muted">Step 1 of 2</span>
          </div>
        }
      />
      <form
        noValidate
        onSubmit={handleSubmit(next)}
        className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg lg:my-8 lg:min-h-0 lg:flex-none lg:overflow-hidden lg:rounded-card lg:border lg:border-outline-soft lg:bg-white lg:shadow-card"
      >
        <div className="flex-1 space-y-4 px-5 py-3">
          <RegistrationRecoveryStatus />
          {!editing ? <div className="flex justify-end text-xs"><button type="button" onClick={() => { void clear().catch(() => {}); reset(EMPTY_REGISTRATION); }} className="min-h-11 font-bold text-brand">Clear form</button></div> : null}
          <TextField
            label="Full name"
            placeholder="e.g. Amaka Okoro"
            autoComplete="off"
            error={errors.fullName?.message}
            {...register('fullName', { validate: (name) => Boolean(name.trim()) || 'Enter the patient’s name' })}
          />

          <div className="flex gap-3">
            <div className="flex-1">
              <div className="mb-1.5 text-[13px] font-semibold text-ink-soft">Sex</div>
              <Controller
                control={control}
                name="sex"
                rules={{ required: 'Choose the patient’s sex' }}
                render={({ field }) => (
                  <SegmentedControl
                    ariaLabel="Sex"
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { value: 'F', label: 'F' },
                      { value: 'M', label: 'M' },
                    ]}
                  />
                )}
              />
              {errors.sex ? <p role="alert" className="mt-1.5 text-[13px] text-danger">{errors.sex.message}</p> : null}
            </div>
            <div className="w-24">
              <TextField
                label="Age"
                type="number"
                inputMode="numeric"
                placeholder="32"
                error={errors.age?.message}
                {...register('age', {
                  validate: {
                    ageOrBirth,
                    wholeYears: (age) =>
                      age.trim() === '' || (Number.isInteger(Number(age)) && Number(age) >= 0 && Number(age) <= 130) || '0–130 years',
                  },
                })}
              />
            </div>
          </div>

          <TextField
            label="Date of birth"
            type="date"
            hint="Leave blank if only an estimated age is known"
            max={todayIso()}
            error={errors.dateOfBirth?.message}
            {...register('dateOfBirth', {
              validate: (date) => !date || (validCalendarDate(date) && date <= todayIso() && (!getValues('age').trim() || yearsBetween(date, todayIso()) === Number(getValues('age')))) || 'Check the birth date and age; they must agree',
            })}
          />
          <label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" {...register('dobEstimated')} />The date of birth is estimated</label>
          <p className="text-xs text-ink-muted">An age recorded without a birth date is treated as estimated.</p>
          <TextField
            label="Phone"
            type="tel"
            inputMode="tel"
            hint="Best way to find them again"
            placeholder="0803 555 0147"
            {...register('phone')}
          />
          <TextField
            label="Address"
            placeholder="e.g. 14 Odo-Ona Elewe, Ibadan"
            error={errors.address?.message}
            {...register('address', { validate: (address) => Boolean(address.trim()) || 'Enter where the patient lives' })}
          />
        </div>

        <footer className="border-t border-outline-soft bg-surface px-5 pb-6 pt-4">
          <Button variant="primary" type="submit">
            Continue — Additional details
          </Button>
        </footer>
      </form>
    </div>
  );
};

export const NewPatientStep1Screen = () => {
  const state = (useLocation().state as RegistrationNavState) ?? {};
  return <RegistrationRecoveryGate key={state.patientId ?? 'new'} draftKey={state.patientId ?? 'new'}><Step1Form key={state.patientId ?? 'new'} state={state} /></RegistrationRecoveryGate>;
};
