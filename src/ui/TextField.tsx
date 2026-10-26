import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { FieldLabel, type FieldExplanation } from './FieldHelp';

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  help?: FieldExplanation;
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
  { label, hint, error, help, id, className = '', 'aria-describedby': describedBy, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  const helpId = `${inputId}-help`;
  const feedbackId = `${inputId}-feedback`;
  return (
    <div className="block">
      <FieldLabel label={label} htmlFor={inputId} help={help} descriptionId={helpId} required={props.required} />
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={[describedBy, help ? helpId : '', error || hint ? feedbackId : ''].filter(Boolean).join(' ') || undefined}
        className={`w-full rounded-field border-[1.5px] bg-white px-4 py-3.5 text-base text-ink outline-none focus:border-2 focus:border-brand ${
          error ? 'border-2 border-danger' : 'border-outline'
        } ${className}`}
        {...props}
      />
      {error ? (
        <span id={feedbackId} className="mt-1.5 block text-[13px] font-medium text-danger">{error}</span>
      ) : hint ? (
        <span id={feedbackId} className="mt-1.5 block text-[13px] text-ink-muted">{hint}</span>
      ) : null}
    </div>
  );
});
