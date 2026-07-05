import type { ReactNode } from 'react';

type Tone = 'brand' | 'amber' | 'danger' | 'ink';

const TONES: Record<Tone, string> = {
  brand: 'text-brand',
  amber: 'text-amber',
  danger: 'text-danger',
  ink: 'text-ink',
};

type Props = {
  value: ReactNode;
  label: string;
  tone?: Tone;
  className?: string;
};

/**
 * A single figure + caption. The figure is monospaced (every digit the same
 * width) — the design uses these for register counts, attendance and positivity.
 */
export const Stat = ({ value, label, tone = 'brand', className = '' }: Props) => {
  return (
    <div className={className}>
      <div className={`font-mono text-[26px] font-semibold leading-none ${TONES[tone]}`}>
        {value}
      </div>
      <div className="mt-1 text-xs text-ink-muted">{label}</div>
    </div>
  );
}
