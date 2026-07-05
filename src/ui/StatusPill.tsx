import type { ReactNode } from 'react';

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error';

const MAP: Record<SyncStatus, { cls: string; dot: string; label: string }> = {
  synced: { cls: 'bg-brand-tint text-brand', dot: 'bg-brand-strong', label: 'Synced' },
  // Amber = "safe, saved on this device, will sync" — never an error.
  pending: { cls: 'bg-amber-bg text-amber-text', dot: 'bg-amber', label: 'Offline' },
  syncing: { cls: 'bg-slate-bg text-slate-text', dot: 'bg-slate', label: 'Syncing…' },
  error: { cls: 'bg-danger-bg text-danger-strong', dot: 'bg-danger', label: 'Not synced' },
};

type Props = {
  status: SyncStatus;
  /** Override the default label, e.g. "Offline — 4 pending". */
  children?: ReactNode;
  className?: string;
};

/**
 * Sync / connection pill. Connection state is never hidden in this product, so
 * this is used in most app bars. Compact (opts out of the 52px control rule).
 */
export function StatusPill({ status, children, className = '' }: Props) {
  const s = MAP[status];
  return (
    <span
      className={`inline-flex min-h-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${s.cls} ${className}`}
    >
      <span className={`h-2 w-2 flex-none rounded-full ${s.dot}`} />
      {children ?? s.label}
    </span>
  );
}
