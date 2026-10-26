import { useId } from 'react';
import { TextAreaField, TextField, ToggleSwitch } from '@/ui';
import { INPUT_TYPE, PLACEHOLDERS, isChoice } from './constants';
import type { EntryValue, RegisterField as Field } from './types';

/**
 * Renders one register field — interactive in an entry form, or static in the
 * builder's live preview (`preview`). One component so what the builder shows is
 * exactly what staff fill in.
 */
type Props = {
  field: Field;
  value?: EntryValue;
  onChange?: (value: EntryValue) => void;
  preview?: boolean;
  error?: string;
};

const Req = ({ on }: { on?: boolean }) => (on ? <span className="text-danger"> *</span> : null);
/** Contract values may be numbers (e.g. from synced docs); inputs need text. */
const asText = (v: EntryValue | undefined): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
const Help = ({ text }: { text?: string }) =>
  text && text.trim() ? <div className="mt-1.5 text-[12px] text-ink-muted">{text}</div> : null;

export const RegisterField = ({ field, value, onChange, preview, error }: Props) => {
  const errorId = useId();
  const label = field.label || 'Untitled field';

  if (field.type === 'section') {
    return (
      <div className="border-b-2 border-brand-tint pb-1.5 text-[12px] font-extrabold uppercase tracking-[0.06em] text-brand-strong">
        {label}
      </div>
    );
  }

  if (isChoice(field.type)) {
    const options = field.options && field.options.length ? field.options : ['Option 1', 'Option 2'];
    const multi = field.type === 'multiselect';
    const arr = Array.isArray(value) ? value : [];
    const single = typeof value === 'string' ? value : '';
    const radius = multi ? 'rounded-[8px]' : 'rounded-full';
    const pick = (o: string) => {
      if (!onChange) return;
      if (multi) onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o]);
      else onChange(o);
    };
    return (
      <fieldset aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined}>
        <legend className="mb-2 text-[13px] font-semibold text-ink-soft">{label}<Req on={field.required} /></legend>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const on = multi ? arr.includes(o) : single === o;
            return (
              <button
                key={o}
                type="button"
                disabled={preview}
                aria-pressed={on}
                onClick={() => pick(o)}
                className={`${radius} min-h-[44px] border-[1.5px] px-3 py-2 text-sm font-semibold ${on ? 'border-brand bg-brand text-white' : 'border-outline bg-white text-ink-soft'}`}
              >
                {o}
              </button>
            );
          })}
        </div>
        <Help text={field.help} />
        {error ? <p id={errorId} className="mt-1 text-sm text-danger">{error}</p> : null}
      </fieldset>
    );
  }

  if (field.type === 'checkbox') {
    return (
      <div className="flex items-center gap-3">
        <ToggleSwitch checked={value === true} disabled={preview} ariaLabel={label} onChange={(v) => onChange?.(v)} />
        <span className="text-sm font-semibold text-ink-soft">{label}<Req on={field.required} /></span>
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div>
        {preview ? (
          <><div className="mb-1.5 text-[13px] font-semibold text-ink-soft">{label}<Req on={field.required} /></div><div className="rounded-field border-[1.5px] border-outline bg-surface-muted px-3 py-3 text-sm text-ink-muted">{PLACEHOLDERS.textarea}</div></>
        ) : (
          <TextAreaField
            label={label}
            name={field.id}
            required={field.required}
            error={error}
            rows={3}
            value={asText(value)}
            onChange={(e) => onChange?.(e.target.value)}
            placeholder={PLACEHOLDERS.textarea}
            className="w-full rounded-field border-[1.5px] border-outline bg-white p-3 text-[15px] leading-relaxed text-ink outline-none focus:border-2 focus:border-brand placeholder:text-ink-muted"
          />
        )}
        <Help text={field.help} />
      </div>
    );
  }

  // single-line input: text / number / phone / date
  if (preview) {
    return (
      <div>
        <div className="mb-1.5 text-[13px] font-semibold text-ink-soft">{label}<Req on={field.required} /></div>
        <div className="rounded-field border-[1.5px] border-outline bg-surface-muted px-3 py-3 text-sm text-ink-muted">
          {PLACEHOLDERS[field.type] ?? 'Type here…'}
        </div>
        <Help text={field.help} />
      </div>
    );
  }
  return (
    <TextField
      label={label}
      required={field.required}
      name={field.id}
      type={INPUT_TYPE[field.type] ?? 'text'}
      value={asText(value)}
      placeholder={PLACEHOLDERS[field.type]}
      hint={field.help}
      error={error}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
};
