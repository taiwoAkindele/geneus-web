import type { ButtonHTMLAttributes } from 'react';

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
};

/**
 * The design's button set. 52px min height comes from the global control rule
 * (index.css); radius, weight and size come from the Foundations spec:
 * radius 12px, weight 700, size 16px.
 */
export function Button({
  variant = 'primary',
  fullWidth = true,
  className = '',
  type = 'button',
  ...props
}: Props) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-field px-5 py-4 text-base font-bold leading-none disabled:opacity-50 ${
        fullWidth ? 'w-full' : ''
      } ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
