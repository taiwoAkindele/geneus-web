import { forwardRef, type InputHTMLAttributes } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

/**
 * Labelled text input. Forwards its ref so React Hook Form's `register()` can be
 * spread directly onto it. Single responsibility: render one input + its
 * label/hint/error.
 *
 * Design: label 13/600 on-surface-variant; field 1.5px outline, 12px radius,
 * 16px text; focus is a 2px primary ring; error is a 2px red border.
 */
export const TextField = forwardRef<HTMLInputElement, Props>(function TextField(
  { label, hint, error, id, className = '', ...props },
  ref,
) {
  const inputId = id ?? props.name;
  return (
    <label htmlFor={inputId} className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-soft">{label}</span>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={`w-full rounded-field border-[1.5px] bg-white px-4 py-3.5 text-base text-ink outline-none focus:border-2 focus:border-brand ${
          error ? 'border-2 border-danger' : 'border-outline'
        } ${className}`}
        {...props}
      />
      {error ? (
        <span className="mt-1.5 block text-[13px] font-medium text-danger">{error}</span>
      ) : hint ? (
        <span className="mt-1.5 block text-[13px] text-ink-muted">{hint}</span>
      ) : null}
    </label>
  );
});
