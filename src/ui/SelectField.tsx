import { forwardRef, type SelectHTMLAttributes } from 'react';

type Option = { value: string; label: string };

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: Option[];
  error?: string;
};

/**
 * Labelled select. Forwards its ref so React Hook Form's `register()` can be
 * spread directly onto it. Native <select> is kept deliberately — it is the
 * lightest, most reliable picker on a low-end offline phone. Styling matches
 * TextField (1.5px outline, 12px radius, 16px text) plus a caret.
 */
export const SelectField = forwardRef<HTMLSelectElement, Props>(function SelectField(
  { label, options, error, id, className = '', ...props },
  ref,
) {
  const selectId = id ?? props.name;
  return (
    <label htmlFor={selectId} className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">{label}</span>
      <div className="relative">
        <select
          ref={ref}
          id={selectId}
          aria-invalid={error ? true : undefined}
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
        <span className="mt-1.5 block text-[13px] font-medium text-danger">{error}</span>
      ) : null}
    </label>
  );
});
