import { STEPS } from '../steps';
import type { EncounterState } from '../types';

/**
 * The encounter "spine" — the seven sections as a horizontal, scrollable row of
 * step chips. Locked steps show a check, the current step is filled green, the
 * rest are muted. Gives anyone a one-glance read of how far the visit has got.
 */
export const EncounterSpine = ({ enc }: { enc: EncounterState }) => (
  <div className="flex gap-2 overflow-x-auto px-5 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
    {STEPS.map((s, i) => {
      const locked = Boolean(enc.sig[s.key]);
      const active = i === enc.stage && !enc.closed;
      return (
        <span
          key={s.key}
          className={`flex flex-none items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${
            locked ? 'bg-brand-tint text-brand' : active ? 'bg-brand text-white' : 'bg-surface-muted text-ink-muted'
          }`}
        >
          <span
            className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-extrabold ${
              locked ? 'bg-brand text-white' : active ? 'bg-brand-accent-soft text-brand' : 'bg-surface-high text-ink-muted'
            }`}
          >
            {locked ? '✓' : i + 1}
          </span>
          {s.short}
        </span>
      );
    })}
  </div>
);
