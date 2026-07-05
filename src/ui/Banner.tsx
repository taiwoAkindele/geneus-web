import type { ReactNode } from 'react';

type Tone = 'amber' | 'info' | 'success';

const TONES: Record<Tone, { box: string; text: string; icon: string }> = {
  // Amber = working offline, everything saved on this device. Reassuring, not an error.
  amber: { box: 'bg-amber-bg border-amber-border', text: 'text-amber-text', icon: 'bg-amber' },
  info: { box: 'bg-surface-muted border-outline-soft', text: 'text-ink-soft', icon: 'bg-slate' },
  success: { box: 'bg-brand-tint border-brand-tint', text: 'text-brand', icon: 'bg-brand-strong' },
};

type Props = {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  /** Glyph shown in the leading square (defaults to "!"). */
  icon?: ReactNode;
  className?: string;
};

/**
 * Inline status banner — chiefly the offline notice ("Working offline —
 * everything is saved on this device"). Amber by default; `info`/`success` reuse
 * the same shape for other tones.
 */
export const Banner = ({ tone = 'amber', title, children, icon = '!', className = '' }: Props) => {
  const t = TONES[tone];
  return (
    <div className={`flex items-start gap-3.5 rounded-card border p-4 ${t.box} ${className}`}>
      <div
        className={`flex h-10 w-10 flex-none items-center justify-center rounded-[10px] text-lg font-extrabold text-white ${t.icon}`}
      >
        {icon}
      </div>
      <div className={t.text}>
        <div className="text-[15px] font-bold">{title}</div>
        {children ? <div className="mt-0.5 text-[13px] opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}
