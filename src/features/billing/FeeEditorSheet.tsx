import { useRef, useState } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import { ChargeWhen, FeeCategory, VisitType, type FeeItem } from '@shared';
import type { FeeDraft } from '@/data/repos/billing';
import { listBillingDepartments } from '@/data/repos/billing';
import { useLiveQuery } from '@/data';
import { Button, SelectField, Sheet, TextField } from '@/ui';
import { CATEGORY_LABELS, CHARGE_WHEN_LABELS, emptyRule, EXEMPTION_PRESETS, FEE_CURRENCIES, feeDraftFromForm, feeFormValues, VISIT_TYPE_LABELS, type FeeForm } from './feeForm';

type Props = {
  fee?: FeeItem;
  defaultCurrency?: string;
  onSave: (draft: FeeDraft) => Promise<void>;
  onClose: () => void;
};

export const FeeEditorSheet = ({ fee, defaultCurrency, onSave, onClose }: Props) => {
  const departments = useLiveQuery(listBillingDepartments);
  const { register, control, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FeeForm>({
    defaultValues: feeFormValues(fee, defaultCurrency),
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'exemptions' });
  const saving = useRef(false);
  const initialCurrency = fee?.currency ?? defaultCurrency ?? '';
  const [customCurrency, setCustomCurrency] = useState(Boolean(initialCurrency && !FEE_CURRENCIES.some((currency) => currency.value === initialCurrency)));
  const close = () => { if (!saving.current) onClose(); };

  const save = handleSubmit(async (values) => {
    if (saving.current) return;
    saving.current = true;
    try {
      await onSave(feeDraftFromForm(values));
    } catch (cause) {
      setError('root', { message: cause instanceof Error ? cause.message : 'Could not save this fee. Please try again.' });
    } finally {
      saving.current = false;
    }
  });

  return (
    <Sheet title={fee ? 'Edit fee' : 'Add a fee'} eyebrow="Manage fees" onClose={close} closeDisabled={isSubmitting}>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={isSubmitting} className="space-y-4">
          <TextField label="Fee name" placeholder="e.g. Consultation" required {...register('name', { required: true })} />
          <SelectField label="Category" options={FeeCategory.options.map((value) => ({ value, label: CATEGORY_LABELS[value] }))} {...register('category')} />
          <SelectField label="Receiving department" options={[{ value: '', label: 'Hospital / general' }, ...(departments.data ?? []).filter((d) => d.active || d.id === fee?.departmentId).map((d) => ({ value: d.id, label: d.name }))]} {...register('departmentId')} />
          {departments.error ? <p role="alert" className="text-sm text-danger">Departments could not be read. <button type="button" onClick={departments.reload}>Try again</button></p> : null}
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Amount" inputMode="decimal" placeholder="0.00" required {...register('amount', { required: true })} />
            <Controller name="currency" control={control} rules={{ required: 'Choose a currency' }} render={({ field }) => <div className="space-y-2"><SelectField label="Currency" name="fee_currency_choice" required value={customCurrency ? 'other' : field.value} error={errors.currency?.message} options={[{ value: '', label: 'Choose currency' }, ...FEE_CURRENCIES, { value: 'other', label: 'Other currency' }]} onChange={(event) => { const value = event.target.value; setCustomCurrency(value === 'other'); field.onChange(value === 'other' ? '' : value); }} />{customCurrency ? <TextField label="Currency code" placeholder="Three-letter code" required maxLength={3} minLength={3} pattern="[A-Za-z]{3}" name={field.name} ref={field.ref} value={field.value} onBlur={field.onBlur} onChange={(event) => field.onChange(event.target.value.toUpperCase())} /> : null}</div>} />
          </div>
          <SelectField label="Charge this fee" options={ChargeWhen.options.map((value) => ({ value, label: CHARGE_WHEN_LABELS[value] }))} {...register('chargeWhen')} />
          <p className="text-[13px] leading-relaxed text-ink-muted">Price changes apply to future charges. Existing bills keep their original price.</p>

          <div className="border-t border-outline-soft pt-4">
            <h3 className="text-[15px] font-bold text-ink">Automatic exemptions</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              The fee is free when any one rule matches. Every condition within that rule must match. Leave a condition blank to ignore it.
            </p>
          </div>
          <div className="space-y-2"><p className="text-xs text-ink-muted">Start with a policy your facility uses, then adjust its conditions.</p><div className="flex flex-wrap gap-2">{EXEMPTION_PRESETS.map((preset) => <Button key={preset.label} variant="outlined" fullWidth={false} className="px-3 py-2 text-[13px]" onClick={() => append({ ...preset.rule, visitTypes: [...preset.rule.visitTypes] })}>＋ {preset.label}</Button>)}</div></div>
          {fields.map((field, index) => (
            <fieldset key={field.id} className="space-y-3 rounded-card border border-outline-soft bg-surface p-3.5">
              <legend className="px-1 text-[13px] font-bold text-brand">Exemption {index + 1}</legend>
              <TextField label="Reason shown on the bill" placeholder="e.g. Under-5 policy" required {...register(`exemptions.${index}.reason`, { required: true })} />
              <div className="grid grid-cols-2 gap-3">
                <TextField label="Age from (years)" type="number" min={0} max={130} step={1} {...register(`exemptions.${index}.ageFromYears`)} />
                <TextField label="Age under (years)" type="number" min={1} max={130} step={1} {...register(`exemptions.${index}.ageUnderYears`)} />
              </div>
              <SelectField label="Sex" options={[{ value: '', label: 'Any' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} {...register(`exemptions.${index}.sex`)} />
              <fieldset>
                <legend className="mb-2 text-[13px] font-semibold text-ink-soft">Visit types (none selected means any)</legend>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {VisitType.options.map((value) => (
                    <label key={value} className="flex min-h-[44px] items-center gap-2 text-[13px] text-ink">
                      <input type="checkbox" value={value} className="h-4 w-4 accent-brand" {...register(`exemptions.${index}.visitTypes`)} />
                      {VISIT_TYPE_LABELS[value]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Button variant="danger" fullWidth={false} className="px-2 py-2" onClick={() => remove(index)}>Remove rule</Button>
            </fieldset>
          ))}
          <Button variant="outlined" onClick={() => append(emptyRule())}>＋ Add exemption rule</Button>
        </fieldset>
        {errors.root ? <p role="alert" className="rounded-card bg-danger-bg p-3 text-[13px] font-semibold text-danger">{errors.root.message}</p> : null}
        <div className="sticky bottom-0 flex gap-3 border-t border-outline-soft bg-white py-4">
          <Button variant="outlined" fullWidth={false} disabled={isSubmitting} onClick={close}>Cancel</Button>
          <Button type="submit" loading={isSubmitting} className="flex-1">Save fee</Button>
        </div>
      </form>
    </Sheet>
  );
};
