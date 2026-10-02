import type { ReactNode } from 'react';

// Two different truths a user needs to tell apart, so they are two states:
//   offline  = no connection right now (a fact about the network)
//   pending  = writes saved on this device, still waiting to upload (a fact
//              about the sync queue — can be true even while online)
// Conflating them ("Offline" for anything unsynced) hides whether data has
// actually left the device, which undercuts the offline-honesty promise.
export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'offline' | 'error';

const MAP: Record<SyncStatus, { cls: string; dot: string; label: string }> = {
  synced: { cls: 'bg-brand-tint text-brand', dot: 'bg-brand-strong', label: 'Up to date' },
  // Amber = "safe, saved on this device, will sync" — never an error.
  pending: { cls: 'bg-amber-bg text-amber-text', dot: 'bg-amber', label: 'Waiting to sync' },
  syncing: { cls: 'bg-slate-bg text-slate-text', dot: 'bg-slate', label: 'Syncing…' },
  offline: { cls: 'bg-amber-bg text-amber-text', dot: 'bg-amber', label: 'Offline' },
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
export const StatusPill = ({ status, children, className = '' }: Props) => {
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
