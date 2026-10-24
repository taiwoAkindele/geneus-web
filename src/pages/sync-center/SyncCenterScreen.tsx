import { useNavigate } from 'react-router-dom';
import { AppBar, Button, Stat, StatusPill } from '@/ui';
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
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { shift, access } = useSession();
  const sync = useSyncStatus();
  const indicator = indicatorFor(sync);
  const headline =
    indicator === 'error'
      ? 'Sync problem'
      : indicator === 'offline'
        ? 'Offline — changes are safe on this device'
        : sync.pending > 0
          ? 'Syncing to cloud'
          : 'Up to date';
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar title="Sync & device" onBack={() => navigate(-1)} right={<StatusPill status={indicator} />} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg lg:max-w-3xl">
        <div className="flex-1 space-y-5 px-5 py-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
          {/* Sync status */}
          <div>
            <div className="rounded-[18px] border border-outline-soft bg-white p-4">
              <div className="mb-3.5 flex items-center justify-between">
                <span className="text-base font-bold">{headline}</span>
                <span className="font-mono text-[13px] text-slate-text">{lastSyncedLabel(sync.lastSyncedAt)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-high">
                <div className={`h-full bg-slate ${sync.pending > 0 ? 'w-1/2' : 'w-full'}`} />
              </div>
              <div className="mt-4 flex justify-between text-center">
                <Stat value={sync.connected ? 'Yes' : 'No'} label="Connected" />
                <Stat value={String(sync.pending)} label="Waiting" tone={sync.pending > 0 ? 'amber' : undefined} />
                <Stat value="0" label="Lost" />
              </div>
            </div>
            <p className="mx-1 mt-3.5 text-[13px] leading-relaxed text-ink-muted">
              {sync.error
                ? `The last sync attempt failed: ${sync.error}. Changes stay on this device and are retried automatically.`
                : 'Everything is safe on this device. Nothing is ever lost because the internet dropped.'}
            </p>
          </div>

          {/* Roster information does not close the signed-in session. */}
          <section className="rounded-[18px] border border-outline-soft bg-white p-4" aria-label="Sign-in and shift status">
            <h2 className="text-[17px] font-extrabold">{shift ? shift.ended ? 'Shift ended' : `Shift ends ${shift.endsAtLabel}` : accessLabel(access)}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">{access === 'admin' ? 'You can sign in at any time. Administrator sessions still close after 30 minutes without activity.' : access === 'always' ? 'You can sign in at any time, every day, without a roster window. Sign out when finished.' : 'Your shift controls new sign-ins. An existing session stays open after the shift ends. Sign out when finished.'}</p>
          </section>

          {/* Reconcile queue — refused uploads wait here for a person, never silently dropped */}
          <div className="lg:col-span-2">
            <div className="mb-2.5 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">Needs attention</div>
            <ReconcileQueue />
          </div>

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
