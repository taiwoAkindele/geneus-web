import { Avatar, Button, Sheet } from '@/ui';
import type { Actor } from '../types';

/**
 * The deliberate save (PRD §9.8.4). Shows a plain summary of exactly what was
 * entered, states in words that the save is permanent, names who it will be
 * stamped to, and offers only "Save permanently" or "Keep editing" — never a
 * quiet auto-save.
 */
type Props = {
  title: string;
  rows: { label: string; value: string }[];
  actor: Actor;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
};

export const ReviewSaveSheet = ({ title, rows, actor, confirmLabel, onConfirm, onClose }: Props) => (
  <Sheet onClose={onClose} eyebrow="Review before saving" title={title}>
    <p className="mb-4 text-sm leading-relaxed text-ink-muted">
      You are about to save this permanently. It cannot be edited after saving — only amended.
    </p>

    <div className="overflow-hidden rounded-card border border-outline-soft">
      {rows.map((r, i) => (
        <div
          key={r.label}
          className={`flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 ${i > 0 ? 'border-t border-outline-soft' : ''}`}
        >
          <div className="min-w-[130px] text-[13px] font-semibold text-ink-muted">{r.label}</div>
          <div className="flex-1 text-[15px] font-medium text-ink">{r.value}</div>
        </div>
      ))}
    </div>

    <div className="mt-4 flex items-center gap-3 rounded-card bg-brand-tint p-3.5">
      <Avatar tone="green" size="sm">
        {actor.name.replace(/^Dr\.?\s+/, '').split(' ').map((p) => p[0]).slice(0, 2).join('')}
      </Avatar>
      <div className="text-[13px] leading-snug text-brand-strong">
        Signing as <b className="text-brand">{actor.name}</b> · {actor.role}
        <br />
        <span className="text-ink-soft">The date &amp; time are stamped automatically.</span>
      </div>
    </div>

    <div className="mt-5 space-y-2">
      <Button variant="primary" onClick={onConfirm}>
        {confirmLabel}
      </Button>
      <Button variant="outlined" onClick={onClose}>
        Keep editing
      </Button>
    </div>
  </Sheet>
);
