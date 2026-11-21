import { useRef } from 'react';
import { useForm } from 'react-hook-form';
import { FeeCategory, type FeeItem } from '@shared';
import type { FeeDraft } from '@/data/repos/billing';
import { Button, SelectField, Sheet, SheetCancelButton, TextField, useToast } from '@/ui';
import { userMessage } from '@/lib/api/userMessage';
import { StaffVerification } from '@/modules/insurance/StaffVerification';
import { isLegacyFeeCategory } from '@shared';
import { CATEGORY_LABELS, feeDraftFromForm, feeFormValues, type FeeForm } from './feeForm';

type Props = { fee?: FeeItem; defaultCurrency?: string; expandedCategories?:boolean; onSave: (draft: FeeDraft) => Promise<void>; onClose: () => void };

export const FeeEditorSheet = ({ fee, defaultCurrency = 'NGN', expandedCategories=false, onSave, onClose }: Props) => {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting, isDirty } } = useForm<FeeForm>({ defaultValues: feeFormValues(fee) });
  const saving = useRef(false);
  const toast = useToast();
  const currency = fee?.currency ?? defaultCurrency;
  const save = handleSubmit(async (values) => {
    if (saving.current) return;
    saving.current = true;
    try { await onSave(feeDraftFromForm({ ...values, category: fee?.category ?? values.category }, currency)); }
    catch (cause) { const message = userMessage(cause, 'This item was not saved. Try again.'); setError('root', { message }); toast(message, { tone: 'error' }); }
    finally { saving.current = false; }
  });
  return <Sheet title={fee ? 'Edit item' : 'Add item'} eyebrow="Prices" onClose={() => { if (!saving.current) onClose(); }} closeDisabled={isSubmitting} hasUnsavedChanges={isDirty} placement="side">
    <form id="catalogue-item-form" onSubmit={save} className="space-y-4">
      {fee ? <p className="text-xs text-ink-muted">Item ID <span className="select-all break-all font-mono">{fee.id}</span> · used to update this price from a spreadsheet</p> : null}
      <fieldset disabled={isSubmitting} className="space-y-4">
        <TextField label="Item name" required {...register('name', { required: 'Enter an item name' })} error={errors.name?.message} />
        <SelectField label="Category" required disabled={Boolean(fee)} options={FeeCategory.options.filter(value=>expandedCategories || isLegacyFeeCategory(value) || fee?.category===value).map((value) => ({ value, label: CATEGORY_LABELS[value] }))} {...register('category')} />
        {fee ? <p className="text-sm text-ink-muted">The category is protected to preserve insurance coverage. Price and name can still be edited.</p> : null}
        <TextField label="Price" required inputMode="decimal" hint={'Currency: ' + currency} {...register('amount', { required: 'Enter a price' })} error={errors.amount?.message} />
        <TextField label="Description (optional)" {...register('description', {maxLength:1000})} />
        <p className="text-sm text-ink-muted">{fee ? 'Existing bills keep their original price. Automatic charging and exemptions are managed separately.' : 'This item is charged only when selected. Creating it does not add it to patient appointments.'}</p>
      </fieldset>
      {errors.root ? <p role="alert" className="rounded-card bg-danger-bg p-3 text-sm text-danger">{errors.root.message}</p> : null}
    </form>
      <div className="sticky bottom-0 space-y-3 border-t border-outline-soft bg-white py-4">
        <StaffVerification requireServerSession purpose="Saving a catalogue item"><Button type="submit" form="catalogue-item-form" loading={isSubmitting}>Save item</Button></StaffVerification>
        <SheetCancelButton disabled={isSubmitting}>Cancel</SheetCancelButton>
      </div>
  </Sheet>;
};
