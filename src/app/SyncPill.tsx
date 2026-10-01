import { StatusPill } from '@/ui';
import { indicatorFor, useSyncStatus } from '@/data';

/**
 * The sync pill as it really is right now (root §4.3b): read from PowerSync's
 * status and its upload queue, never a fixed label. "3 waiting to sync" means
 * three changes are saved on this phone and have not reached the server.
 */
export const SyncPill = ({ className }: { className?: string }) => {
  const sync = useSyncStatus();
  const status = indicatorFor(sync);
  return (
    <StatusPill status={status} className={className}>
      {status === 'pending' ? `${sync.pending} waiting to sync` : undefined}
    </StatusPill>
  );
};
