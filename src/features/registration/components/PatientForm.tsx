import { useForm } from 'react-hook-form';
import { Card } from '@/ui/Card';
import { TextField } from '@/ui/TextField';
import { SelectField } from '@/ui/SelectField';
import { Button } from '@/ui/Button';
import type { PatientFormValues } from '../types';

type Props = {
  onSubmit: (values: PatientFormValues) => void;
  submitting?: boolean;
};

/**
 * NASADOR registration form (PRD §10), built with React Hook Form.
 *
 * Single responsibility: collect + validate the form and hand valid values up
 * via `onSubmit`. It does NOT persist — the screen decides what to do with the
 * values. Zod validation from the shared contract replaces the inline rules in
 * the integration step.
 */
export const PatientForm = ({ onSubmit, submitting = false }: Props) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PatientFormValues>({
    defaultValues: { sex: 'female' },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Card className="space-y-4">
        <TextField
          label="Full name"
          autoComplete="off"
          error={errors.fullName?.message}
          {...register('fullName', { required: 'Name is required' })}
        />
        <TextField
          label="Address"
          autoComplete="off"
          error={errors.address?.message}
          {...register('address', { required: 'Address is required' })}
        />
        <SelectField
          label="Sex"
          options={[
            { value: 'female', label: 'Female' },
            { value: 'male', label: 'Male' },
          ]}
          {...register('sex')}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="Age (years)"
            type="number"
            inputMode="numeric"
            {...register('ageYears')}
          />
          <TextField label="Date of birth" type="date" {...register('dateOfBirth')} />
        </div>
        <TextField
          label="Phone (optional)"
          type="tel"
          inputMode="tel"
          hint="Best way to find a returning patient"
          {...register('phone')}
        />
      </Card>

      <Button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Save patient'}
      </Button>
    </form>
  );
}
