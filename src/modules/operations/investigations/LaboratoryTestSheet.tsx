import { useState } from 'react';
import { LABORATORY_SPECIMEN_TYPES, LaboratoryTestInput, type ResultTemplate } from '@shared';
import { saveLaboratoryTests } from '@/lib/api/investigations';
import { useAuthorizationContext, StaffVerification } from '@/session';
import { Button, SelectField, Sheet, SheetCancelButton, TextField, useToast } from '@/ui';

export const pricingCategoryOptions = [
  { value: '', label: 'Select pricing category' },
  { value: 'billable', label: 'Billable' },
  { value: 'non_billable', label: 'Non-billable' },
];

const specimenOptions = [
  { value: '', label: 'Select specimen type' },
  ...LABORATORY_SPECIMEN_TYPES.map((name) => ({ value: name, label: name })),
  { value: 'other', label: 'Other' },
];

const specimenRules = [
  { value: '', label: 'Select a requirement' },
  { value: 'any', label: 'Any one of these specimens' },
  { value: 'all', label: 'All listed specimens' },
];

type SpecimenRow = { id: string; type: string; custom: string };

export const LaboratoryTestSheet = ({
  templates,
  onClose,
}: {
  templates: ResultTemplate[];
  onClose: () => void;
}) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [specimens, setSpecimens] = useState<SpecimenRow[]>([
    { id: 'first', type: '', custom: '' },
  ]);
  const [requirement, setRequirement] = useState('');
  const [pricingCategory, setPricingCategory] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [aliases, setAliases] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const canLink = context.permissions.includes('result_template:manage');

  const updateSpecimen = (id: string, patch: Partial<Pick<SpecimenRow, 'type' | 'custom'>>) =>
    setSpecimens((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const save = async () => {
    const parsed = LaboratoryTestInput.safeParse({
      name,
      department,
      aliases: aliases
        .split(/[;,]/)
        .map((value) => value.trim())
        .filter(Boolean),
      catalogue: {
        pricingCategory,
        specimenTypes: specimens.map(({ type, custom }) => (type === 'other' ? custom : type)),
        specimenRequirement: specimens.length > 1 ? requirement : undefined,
      },
      resultTemplateId: templateId || undefined,
    });

    if (!parsed.success) {
      setError(
        'Enter the test name and section, choose distinct specimen types and the pricing category. Multiple specimens need a requirement.',
      );
      return;
    }

    setBusy(true);
    setError('');

    try {
      const result = await saveLaboratoryTests(context, [parsed.data]);

      if (!result.added.length) {
        setError('A test with that name or other name already exists');
        return;
      }

      toast(
        pricingCategory === 'billable'
          ? 'Test saved as a draft for Billing to price.'
          : 'Test is active and will be orderable after sync.',
      );
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the test');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Add investigation"
      placement="side"
      onClose={onClose}
      hasUnsavedChanges={Boolean(name || department || specimens[0].type || pricingCategory)}
    >
      <div className="space-y-4">
        <TextField
          label="Test name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label="Lab section"
            required
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
          />
          <TextField
            label="Other names (optional)"
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
          />
        </div>
        {canLink ? (
          <SelectField
            label="Result template"
            value={templateId}
            onChange={(event) => setTemplateId(event.target.value)}
            options={[
              { value: '', label: 'Text result only' },
              ...templates.map(({ id, name: label }) => ({ value: id, label })),
            ]}
          />
        ) : null}
        <SelectField
          label="Pricing category"
          required
          options={pricingCategoryOptions}
          value={pricingCategory}
          onChange={(event) => setPricingCategory(event.target.value)}
        />
        {pricingCategory ? (
          <p className="text-sm text-ink-soft">
            {pricingCategory === 'billable'
              ? 'Saved as a draft until Billing publishes a price.'
              : 'Available to order after sync, with no charge.'}
          </p>
        ) : null}
        {specimens.map((specimen, index) => (
          <div className="space-y-2" key={specimen.id}>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <SelectField
                  label={index ? `Additional specimen type ${index}` : 'Specimen type'}
                  required
                  value={specimen.type}
                  options={specimenOptions}
                  onChange={(event) => updateSpecimen(specimen.id, { type: event.target.value })}
                />
              </div>
              {index ? (
                <Button
                  variant="outlined"
                  fullWidth={false}
                  onClick={() =>
                    setSpecimens((rows) => rows.filter(({ id }) => id !== specimen.id))
                  }
                >
                  Remove
                </Button>
              ) : null}
            </div>
            {specimen.type === 'other' ? (
              <TextField
                label="Other specimen type"
                required
                value={specimen.custom}
                onChange={(event) => updateSpecimen(specimen.id, { custom: event.target.value })}
              />
            ) : null}
          </div>
        ))}
        {specimens.length < 20 ? (
          <Button
            variant="outlined"
            fullWidth={false}
            onClick={() => {
              if (specimens.length === 1) {
                setRequirement('');
              }
              setSpecimens([...specimens, { id: crypto.randomUUID(), type: '', custom: '' }]);
            }}
          >
            Add another specimen
          </Button>
        ) : null}
        {specimens.length > 1 ? (
          <SelectField
            label="Specimen requirement"
            required
            options={specimenRules}
            value={requirement}
            onChange={(event) => setRequirement(event.target.value)}
          />
        ) : null}
        {error ? (
          <p role="alert" className="text-danger-strong">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <SheetCancelButton />
          <StaffVerification requireServerSession purpose="Saving a laboratory investigation">
            <Button
              fullWidth={false}
              loading={busy}
              disabled={busy || !pricingCategory}
              onClick={() => void save()}
            >
              {pricingCategory === 'billable' ? 'Save draft' : 'Save investigation'}
            </Button>
          </StaffVerification>
        </div>
      </div>
    </Sheet>
  );
};
