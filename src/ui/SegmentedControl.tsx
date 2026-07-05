import type { ReactNode } from 'react';

type Option<T extends string> = { value: T; label: ReactNode };

type Props<T extends string> = {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible group label (visually hidden). */
  ariaLabel?: string;
  className?: string;
};

/**
 * Equal-width single-choice control (Sex F/M, Level of care, Test/Result,
 * Religion). The selected segment fills primary green; the rest are hairline
 * outlines. For 2–3 short options shown inline.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}: Props<T>) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`flex gap-2 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex-1 rounded-[11px] px-2 py-3 text-center text-sm font-bold ${
              active
                ? 'bg-brand text-white'
                : 'border-[1.5px] border-outline bg-white text-ink-soft'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
