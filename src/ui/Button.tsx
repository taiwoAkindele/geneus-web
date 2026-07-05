import type { ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type Variant =
  | 'primary' // filled green — the one primary action
  | 'secondary' // light green fill
  | 'outlined' // white, green text, hairline border
  | 'ghost' // green text only
  | 'danger' // red text only (e.g. "Remove staff")
  | 'danger-outline'; // red border (e.g. "End shift now")

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white shadow-card active:bg-brand-dark',
  secondary: 'bg-brand-tint text-brand active:brightness-95',
  outlined: 'border-[1.5px] border-outline bg-white text-brand active:bg-brand-tint',
  ghost: 'text-brand active:bg-brand-tint',
  danger: 'text-danger active:bg-danger-bg',
  'danger-outline': 'border-[1.5px] border-danger text-danger active:bg-danger-bg',
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  /** Full-width by default (the design's primary actions span the footer). */
  fullWidth?: boolean;
  /**
   * Show a pending spinner and disable the button while a write/mutation runs.
   * Required by the offline-first UX rule: actions never allow double-submit and
   * always show progress (CLAUDE.md · PRD §13).
   */
  loading?: boolean;
};

/**
 * The design's button set. 52px min height comes from the global control rule
 * (index.css); radius, weight and size come from the Foundations spec:
 * radius 12px, weight 700, size 16px.
 */
export const Button = ({
  variant = 'primary',
  fullWidth = true,
  loading = false,
  className = '',
  type = 'button',
  children,
  disabled,
  ...props
}: Props) => {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-field px-5 py-4 text-base font-bold leading-none disabled:opacity-50 ${
        fullWidth ? 'w-full' : ''
      } ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading ? <Loader2 aria-hidden className="h-5 w-5 flex-none animate-spin" /> : null}
      {children}
    </button>
  );
}
