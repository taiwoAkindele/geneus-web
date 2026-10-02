import type { ReactNode } from 'react';
import { Button, Icon } from '@/ui';
import type { Amendment, Signature } from '../types';

/**
 * One encounter section. Three states (PRD §9.8): pending (locked behind the
 * step before it), active (its form + a distinct Review & Save), and locked
 * (a read-only summary signed by its author, with any amendments beneath).
 */
type Props = {
  index: number;
  title: string;
  hint: string;
  state: 'pending' | 'active' | 'locked';
  summary: { label: string; value: string }[];
  signature?: Signature;
  amendments?: Amendment[];
  reviewLabel: string;
  onReview: () => void;
  onAmend: () => void;
  children?: ReactNode;
};

const SummaryRows = ({ rows }: { rows: { label: string; value: string }[] }) => (
  <div className="space-y-2">
    {rows.map((r) => (
      <div key={r.label} className="flex flex-wrap gap-x-4 gap-y-0.5">
        <div className="min-w-[130px] text-[13px] font-semibold text-ink-muted">{r.label}</div>
        <div className="flex-1 text-sm text-ink">{r.value}</div>
      </div>
    ))}
  </div>
);

export const SectionCard = ({
  index,
  title,
  hint,
  state,
  summary,
  signature,
  amendments = [],
  reviewLabel,
  onReview,
  onAmend,
  children,
}: Props) => {
  const active = state === 'active';
  const locked = state === 'locked';

  return (
    <div
      className={`overflow-hidden rounded-card border bg-white ${active ? 'border-brand' : 'border-outline-soft'} ${
        state === 'pending' ? 'opacity-70' : ''
      }`}
    >
      {/* header */}
      <div className={`flex items-center gap-3 border-b px-4 py-3.5 ${active ? 'border-brand-tint bg-brand-wash' : 'border-outline-soft'}`}>
        <span
          className={`flex h-7 w-7 flex-none items-center justify-center rounded-lg font-mono text-xs font-extrabold ${
            locked || active ? 'bg-brand text-white' : 'bg-surface-container text-ink-muted'
          }`}
        >
          {locked ? '✓' : String(index + 1).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-extrabold tracking-[-0.01em] text-ink">{title}</div>
          <div className="text-xs text-ink-muted">{hint}</div>
        </div>
        <span
          className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-bold ${
            locked ? 'bg-brand-tint text-brand' : active ? 'bg-brand text-white' : 'bg-surface-container text-ink-muted'
          }`}
        >
          {locked ? 'Locked' : active ? 'Recording' : 'Pending'}
        </span>
      </div>

      {/* body */}
      {state === 'pending' ? (
        <div className="flex items-center gap-2.5 px-4 py-5 text-[13px] text-ink-muted">
          <span className="h-4 w-4 flex-none rounded-full border-2 border-outline" />
          Complete the step above before recording this.
        </div>
      ) : locked ? (
        <div className="px-4 py-4">
          <SummaryRows rows={summary} />
          <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-dashed border-outline-hair pt-3">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-tint px-2.5 py-1 text-xs font-bold text-brand">
              <Icon name="check" className="h-3.5 w-3.5" /> Locked
            </span>
            {signature ? (
              <span className="text-xs text-ink-soft">
                Recorded by <b className="text-ink">{signature.actor}</b> · {signature.role} ·{' '}
                <span className="font-mono">
                  {signature.time} · {signature.date}
                </span>
              </span>
            ) : null}
            <button type="button" onClick={onAmend} className="ml-auto min-h-0 text-[13px] font-bold text-brand">
              ＋ Add amendment
            </button>
          </div>
          {amendments.length > 0 ? (
            <div className="mt-3 space-y-2">
              {amendments.map((am, i) => (
                <div key={i} className="rounded-[11px] bg-surface-muted p-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.04em] text-ink-muted">
                    Amendment · <span className="font-mono">{am.time} · {am.date}</span>
                  </div>
                  <div className="my-1 text-sm text-ink">{am.note}</div>
                  <div className="text-xs text-ink-soft">
                    by <b className="text-ink">{am.by}</b> · {am.role}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="px-4 py-4">
          {children}
          <div className="mt-4">
            <Button variant="primary" onClick={onReview}>
              {reviewLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
