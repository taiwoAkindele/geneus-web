type Tone = 'green' | 'mint' | 'slate' | 'amber' | 'muted';
type Size = 'sm' | 'md' | 'lg';

const TONES: Record<Tone, string> = {
  green: 'bg-brand-tint text-brand',
  mint: 'bg-brand-accent-soft text-brand',
  slate: 'bg-slate-bg text-slate-text',
  amber: 'bg-amber-bg text-amber-text',
  muted: 'bg-surface-high text-ink-muted',
};

const SIZES: Record<Size, string> = {
  sm: 'h-10 w-10 text-sm',
  md: 'h-11 w-11 text-sm',
  lg: 'h-12 w-12 text-base',
};

type Props = {
  /** Initials (or a single glyph like "?"). */
  children: string;
  tone?: Tone;
  size?: Size;
  className?: string;
};

/** Round initials avatar. Tone signals the person's context (role/state). */
export const Avatar = ({ children, tone = 'green', size = 'md', className = '' }: Props) => {
  return (
    <span
      className={`inline-flex flex-none items-center justify-center rounded-full font-extrabold ${SIZES[size]} ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
