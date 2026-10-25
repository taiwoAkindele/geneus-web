import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import { FieldLabel, type FieldExplanation } from './FieldHelp';

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; help?: FieldExplanation; error?: string };
export const TextAreaField = forwardRef<HTMLTextAreaElement, Props>(function TextAreaField(
  { label, help, error, id, className = '', 'aria-describedby': describedBy, rows = 3, ...props }, ref,
) {
  const generatedId = useId();
  const inputId = id ?? props.name ?? generatedId;
  const helpId = `${inputId}-help`;
  const errorId = `${inputId}-error`;
  return <div className="block">
    <FieldLabel label={label} htmlFor={inputId} help={help} descriptionId={helpId} required={props.required} />
    <textarea ref={ref} id={inputId} rows={rows} aria-invalid={error ? true : undefined}
      aria-describedby={[describedBy, help ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
      className={`w-full rounded-field border-[1.5px] bg-white p-3.5 text-base leading-relaxed text-ink outline-none focus:border-2 focus:border-brand placeholder:text-ink-muted ${error ? 'border-danger' : 'border-outline'} ${className}`} {...props} />
    {error ? <span id={errorId} className="mt-1.5 block text-[13px] text-danger">{error}</span> : null}
  </div>;
});
