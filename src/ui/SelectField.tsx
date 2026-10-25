import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { FieldLabel, type FieldExplanation } from './FieldHelp';

type Option = { value: string; label: string };

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: Option[];
  error?: string;
  help?: FieldExplanation;
};

/**
 * Labelled select. Forwards its ref so React Hook Form's `register()` can be
 * spread directly onto it. Native <select> is kept deliberately — it is the
 * lightest, most reliable picker on a low-end offline phone. Styling matches
 * TextField (1.5px outline, 12px radius, 16px text) plus a caret.
 */
export const SelectField = forwardRef<HTMLSelectElement, Props>(function SelectField(
  { label, options, error, help, id, className = '', 'aria-describedby': describedBy, ...props },
  ref,
) {
  const generatedId = useId();
  const selectId = id ?? props.name ?? generatedId;
  const helpId = `${selectId}-help`;
  const errorId = `${selectId}-error`;
  return (
    <div className="block">
      <FieldLabel label={label} htmlFor={selectId} help={help} descriptionId={helpId} required={props.required} />
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[describedBy, help ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
          className={`w-full appearance-none rounded-field border-[1.5px] bg-white px-4 py-3.5 pr-10 text-base text-ink outline-none focus:border-2 focus:border-brand ${
            error ? 'border-2 border-danger' : 'border-outline'
          } ${className}`}
          {...props}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span
          aria-hidden
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted"
        >
          ▾
        </span>
      </div>
      {error ? (
        <span id={errorId} className="mt-1.5 block text-[13px] font-medium text-danger">{error}</span>
      ) : null}
    </div>
  );
});
