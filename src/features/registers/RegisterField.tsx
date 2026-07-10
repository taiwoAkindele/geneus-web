import { TextField, ToggleSwitch } from '@/ui';
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
};

const Req = ({ on }: { on?: boolean }) => (on ? <span className="text-danger"> *</span> : null);
const Help = ({ text }: { text?: string }) =>
  text && text.trim() ? <div className="mt-1.5 text-[12px] text-ink-muted">{text}</div> : null;

export const RegisterField = ({ field, value, onChange, preview }: Props) => {
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
      <div>
        <div className="mb-2 text-[13px] font-semibold text-ink-soft">{label}<Req on={field.required} /></div>
        <div className="flex flex-wrap gap-2">
          {options.map((o) => {
            const on = multi ? arr.includes(o) : single === o;
            return (
              <button
                key={o}
                type="button"
                disabled={preview}
                onClick={() => pick(o)}
                className={`${radius} min-h-0 border-[1.5px] px-3 py-2 text-sm font-semibold ${on ? 'border-brand bg-brand text-white' : 'border-outline bg-white text-ink-soft'}`}
              >
                {o}
              </button>
            );
          })}
        </div>
        <Help text={field.help} />
      </div>
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
        <div className="mb-1.5 text-[13px] font-semibold text-ink-soft">{label}<Req on={field.required} /></div>
        {preview ? (
          <div className="rounded-field border-[1.5px] border-outline bg-surface-muted px-3 py-3 text-sm text-ink-muted">{PLACEHOLDERS.textarea}</div>
        ) : (
          <textarea
            rows={3}
            value={typeof value === 'string' ? value : ''}
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
      value={typeof value === 'string' ? value : ''}
      placeholder={PLACEHOLDERS[field.type]}
      hint={field.help}
      onChange={(e) => onChange?.(e.target.value)}
    />
  );
};
