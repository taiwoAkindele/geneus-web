import { useRef, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { ChargeWhen, VisitType, type FeeItem } from '@shared';
import { Button, SelectField, Sheet, SheetCancelButton, TextField } from '@/ui';
import { StaffVerification } from '@/modules/insurance/StaffVerification';
import { CHARGE_WHEN_LABELS, emptyRule, EXEMPTION_PRESETS, feePolicyFromForm, feePolicyValues, VISIT_TYPE_LABELS, type FeePolicyForm } from './feeForm';

export const FeePoliciesSheet = ({ fee, onSave, onClose }: { fee: FeeItem; onSave: (policy: Pick<FeeItem, 'chargeWhen' | 'exemptions'>) => Promise<void>; onClose: () => void }) => {
  const { register, control, handleSubmit, setError, watch, formState: { errors, isDirty, isSubmitting } } = useForm<FeePolicyForm>({ defaultValues: feePolicyValues(fee) });
  const { fields, append, remove } = useFieldArray({ control, name: 'exemptions' });
  const saving = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const enabling = watch('chargeWhen') !== 'when_ordered' && watch('chargeWhen') !== fee.chargeWhen;
  const save = handleSubmit(async (values) => {
    if (saving.current) return;
    if (enabling && !confirmed) { setError('root', { message: 'Confirm the automatic charging change before saving.' }); return; }
    saving.current = true;
    try { await onSave(feePolicyFromForm(values)); }
    catch (cause) { setError('root', { message: cause instanceof Error ? cause.message : 'Could not save the policy.' }); }
    finally { saving.current = false; }
  });
  return <Sheet title="Automatic charging & exemptions" eyebrow={fee.name} placement="side" onClose={() => { if (!saving.current) onClose(); }} closeDisabled={isSubmitting} hasUnsavedChanges={isDirty}>
    <form id="fee-policy-form" onSubmit={save} className="space-y-4">
      <fieldset disabled={isSubmitting} className="space-y-4">
        <SelectField label="Charge this item" options={ChargeWhen.options.map((value) => ({ value, label: CHARGE_WHEN_LABELS[value] }))} {...register('chargeWhen')} />
        {enabling ? <label className="flex gap-2 rounded-field border border-amber-border bg-amber-bg p-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>I intend to charge this fee automatically at registration or every booked visit, according to the selected policy.</span></label> : null}
        <p className="text-sm text-ink-muted">Existing registration and visit-fee policies are preserved until explicitly changed here. Earlier bills are never changed.</p>
        <h3 className="font-bold">Automatic exemptions</h3>
        <p className="text-sm text-ink-muted">The fee is free when any rule matches. Every condition within that rule must match; blank conditions are ignored.</p>
        <div className="flex flex-wrap gap-2">{EXEMPTION_PRESETS.map((preset) => <Button key={preset.label} variant="outlined" fullWidth={false} onClick={() => append({ ...preset.rule, visitTypes: [...preset.rule.visitTypes] })}>{preset.label}</Button>)}</div>
        {fields.map((field, index) => <fieldset key={field.id} className="space-y-3 rounded-card border border-outline-soft p-3">
          <legend className="text-sm font-bold">Exemption {index + 1}</legend>
          <TextField label="Reason shown on the bill" required {...register(`exemptions.${index}.reason`, { required: true })} />
          <div className="grid grid-cols-2 gap-3"><TextField label="Age from (years)" type="number" min={0} max={130} step={1} {...register(`exemptions.${index}.ageFromYears`)} /><TextField label="Age under (years)" type="number" min={1} max={130} step={1} {...register(`exemptions.${index}.ageUnderYears`)} /></div>
          <SelectField label="Sex" options={[{ value: '', label: 'Any' }, { value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }]} {...register(`exemptions.${index}.sex`)} />
          <fieldset><legend className="text-sm font-semibold">Visit types (none means any)</legend><div className="grid grid-cols-2 gap-2">{VisitType.options.map((value) => <label key={value} className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" value={value} {...register(`exemptions.${index}.visitTypes`)} />{VISIT_TYPE_LABELS[value]}</label>)}</div></fieldset>
          <Button variant="danger" fullWidth={false} onClick={() => remove(index)}>Remove rule</Button>
        </fieldset>)}
        <Button variant="outlined" onClick={() => append(emptyRule())}>Add exemption rule</Button>
      </fieldset>
      {errors.root ? <p role="alert" className="rounded-card bg-danger-bg p-3 text-sm text-danger">{errors.root.message}</p> : null}
    </form>
    <StaffVerification requireServerSession purpose="Saving automatic charging and exemptions"><Button type="submit" form="fee-policy-form" loading={isSubmitting} disabled={enabling && !confirmed}>Save policy</Button></StaffVerification>
    <SheetCancelButton disabled={isSubmitting}>Cancel</SheetCancelButton>
  </Sheet>;
};
