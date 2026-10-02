import type { ReactNode } from 'react';

type Tone = 'green' | 'amber' | 'slate' | 'danger' | 'neutral';

const TONES: Record<Tone, string> = {
  green: 'bg-brand-tint text-brand',
  amber: 'bg-amber-bg text-amber-text',
  slate: 'bg-slate-bg text-slate-text',
  danger: 'bg-danger-bg text-danger-strong',
  neutral: 'bg-surface-high text-ink-soft',
};

type Props = {
  children: ReactNode;
  tone?: Tone;
  className?: string;
};

/**
 * Compact status/label pill without a dot (ADMIN, Pending, shift times, level of
 * care). For the sync/connection pill with a leading dot, use StatusPill.
 */
export const Tag = ({ children, tone = 'neutral', className = '' }: Props) => {
  return (
    <span
      className={`inline-flex min-h-0 items-center rounded-full px-2.5 py-1 text-[11px] font-bold ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
