import type { ButtonHTMLAttributes } from 'react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
};

/**
 * Selectable pill for tag-like choices (role, occupation, complaints). Selected
 * fills primary green; unselected is a hairline outline. Compact — opts out of
 * the 52px control rule via `min-h-0`. Callers append a "✓" to the label when
 * selected if they want the design's checkmark.
 */
export function ChoiceChip({ selected = false, className = '', children, ...props }: Props) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`min-h-0 rounded-full px-3.5 py-2 text-sm font-semibold ${
        selected
          ? 'bg-brand text-white'
          : 'border-[1.5px] border-outline bg-white text-ink-soft'
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
