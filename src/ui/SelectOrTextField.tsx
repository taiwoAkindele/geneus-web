import { useState } from 'react';
import { SelectField } from './SelectField';
import { TextField } from './TextField';
import type { FieldExplanation } from './FieldHelp';

type Props = { label: string; name: string; value: string; options: { value: string; label: string }[]; help: FieldExplanation; onChange: (value: string) => void };
const CUSTOM = '__custom_entry__';
/** Known choices speed up entry; custom and historical wording are always preserved. */
export const SelectOrTextField = ({ label, name, value, options, help, onChange }: Props) => {
  const [custom, setCustom] = useState(false);
  const isCustom = custom || Boolean(value && !options.some((option) => option.value === value));
  return <div className="space-y-2">
    <SelectField label={label} name={`${name}_choice`} help={help} value={isCustom ? CUSTOM : value}
      options={[{ value: '', label: 'Choose or leave unrecorded' }, ...options, { value: CUSTOM, label: 'Other / enter exact wording' }]}
      onChange={(event) => {
        const next = event.target.value;
        setCustom(next === CUSTOM);
        if (next !== CUSTOM) onChange(next);
      }} />
    {isCustom ? <TextField label={`Custom ${label.toLowerCase()}`} name={name} value={value} help={help}
      placeholder="Enter the exact instruction" onChange={(event) => onChange(event.target.value)} /> : null}
  </div>;
};
