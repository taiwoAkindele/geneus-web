import { Controller, useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppBar, Button, SegmentedControl, TextField } from '@/ui';
import { SyncPill } from '@/app/SyncPill';
import { EMPTY_REGISTRATION, type RegistrationNavState, type RegistrationValues } from '@/features/registration';

const todayIso = (): string => new Date().toISOString().slice(0, 10);

type Step1Values = Pick<RegistrationValues, 'fullName' | 'sex' | 'age' | 'dateOfBirth' | 'phone' | 'address'>;

/**
 * 4.3 New patient — step 1. Only the fields Nigerian facilities already use.
 * Nothing is saved yet: the values travel to step 2, which saves. Reused for
 * editing — opened with the patient's values and id from their profile.
 */
export const NewPatientStep1Screen = () => {
  const navigate = useNavigate();
  const state = (useLocation().state as RegistrationNavState) ?? {};
  const values = { ...EMPTY_REGISTRATION, ...state.values };
  const editing = Boolean(state.patientId);

  const {
    control,
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<Step1Values>({ defaultValues: values });

  const next = (step1: Step1Values) =>
    navigate('/patients/new/details', { state: { ...state, values: { ...values, ...step1 } } satisfies RegistrationNavState });

  // Age or date of birth: an elderly patient with no records still gets registered (PRD §10).
  const ageOrBirth = () => (getValues('age').trim() || getValues('dateOfBirth') ? true : 'Give an age or a date of birth');

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
            hint="Approximate is fine"
            max={todayIso()}
            error={errors.dateOfBirth?.message}
            {...register('dateOfBirth', {
              validate: (date) => !date || date <= todayIso() || 'A date of birth cannot be in the future',
            })}
          />
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
            Continue — Occupation &amp; Religion
          </Button>
        </footer>
      </form>
    </div>
  );
};
