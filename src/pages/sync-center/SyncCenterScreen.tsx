import { useEffect } from 'react';
import { Button, Stat } from '@/ui';
import { indicatorFor, useSyncStatus } from '@/data';
import { accessLabel } from '@/session/accessPolicy';
import { useAuth, useSession } from '@/session';
import { ReconcileQueue } from '@/features/reconcile';

const lastSyncedLabel = (at: Date | undefined): string => {
  if (!at) return 'Never synced';
  const minutes = Math.round((Date.now() - at.getTime()) / 60_000);
  if (minutes < 1) return 'Synced just now';
  if (minutes < 60) return `Synced ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `Synced ${hours} h ago`;
  return `Synced ${Math.round(hours / 24)} days ago`;
};

/**
 * 4.10 Sync center & shift warning. Sync state is honest — nothing is lost when
 * the internet drops — and staff can sign out without waiting for sync. The
 * numbers are PowerSync's own: the upload queue and the last completed sync.
 */
export const SyncCenterScreen = () => {
  const { signOut } = useAuth();
  const { shift, access, notifications } = useSession();
  useEffect(() => { document.title = 'Sync & review · Geneus Health'; }, []);
  const sync = useSyncStatus();
  const indicator = indicatorFor(sync);
  const headline =
    notifications.some((notification) => notification.kind === 'conflict')
      ? 'Records need review'
      : indicator === 'error'
      ? 'Sync problem'
      : indicator === 'offline'
        ? 'Offline · working from this device'
        : sync.pending > 0
          ? 'Changes waiting to sync'
          : !sync.hasSynced ? 'First sync not completed' : indicator === 'syncing' ? 'Sync in progress' : 'No queued changes';
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg lg:max-w-3xl">
        <h1 className="px-5 pb-4 pt-5 text-2xl font-extrabold">Sync &amp; review</h1>
        <div className="flex-1 space-y-5 px-5 py-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
          {/* Sync status */}
          <div>
            <div className="rounded-[18px] border border-outline-soft bg-white p-4">
              <div className="mb-3.5 flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <span className="text-base font-bold">{headline}</span>
                <span className="font-mono text-[13px] text-slate-text">{lastSyncedLabel(sync.lastSyncedAt)}</span>
              </div>
              <div className="mt-4 flex justify-between text-center">
                <Stat value={sync.connected ? 'Yes' : 'No'} label="Connected" />
                <Stat value={sync.pendingKnown === false ? '—' : String(sync.pending)} label="Queued changes" tone={sync.pending > 0 ? 'amber' : undefined} />
              </div>
            </div>
            <p className="mx-1 mt-3.5 text-[13px] leading-relaxed text-ink-muted">
              {sync.error
                ? `The last sync attempt failed: ${sync.error}. Changes stay on this device and are retried automatically.`
                : 'Changes are saved locally before upload. The queue and review list are separate: an empty queue does not confirm that every change was accepted.'}
            </p>
          </div>

          <div className="lg:col-span-2">
            <h2 className="mb-2.5 text-base font-bold">Records needing review</h2>
            <ReconcileQueue />
          </div>
          {/* Roster information does not close the signed-in session. */}
          <section className="rounded-[18px] border border-outline-soft bg-white p-4" aria-label="Sign-in and shift status">
            <h2 className="text-[17px] font-extrabold">{shift ? shift.ended ? 'Shift ended' : `Shift ends ${shift.endsAtLabel}` : accessLabel(access)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{access === 'admin' ? 'You can sign in at any time. Administrator sessions still close after 30 minutes without activity.' : access === 'always' ? 'You can sign in at any time, every day, without a roster window. Sign out when finished.' : 'Your shift controls new sign-ins. An existing session stays open after the shift ends. Sign out when finished.'}</p>
          </section>


          <div className="flex items-center gap-2.5 px-1 lg:col-span-2">
            <span className="h-2 w-2 rounded-full bg-brand-strong" />
            <span className="text-[13px] text-ink-soft">Sign out before sharing this device</span>
          </div>
        </div>

        <footer className="px-5 pb-6 pt-4">
          <Button variant="danger-outline" onClick={signOut}>
            Sign out
          </Button>
        </footer>
      </div>
    </div>
  );
};
