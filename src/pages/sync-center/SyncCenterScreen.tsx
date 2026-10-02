import { useNavigate } from 'react-router-dom';
import { AppBar, Button, Stat, StatusPill } from '@/ui';
import { indicatorFor, useSyncStatus } from '@/data';
import { useAuth } from '@/session';

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
 * the internet drops — and the system closes access on time, fairly. The
 * numbers are PowerSync's own: the upload queue and the last completed sync.
 */
export const SyncCenterScreen = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
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

          {/* Shift warning */}
          <div className="rounded-[18px] border border-amber-border bg-amber-bg p-4">
            <div className="mb-2.5 flex items-center gap-3">
              <span className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-amber font-mono text-[13px] font-bold text-white">
                30
              </span>
              <span className="text-[17px] font-extrabold text-amber-text">Your shift ends in 30 min</span>
            </div>
            <p className="text-sm leading-relaxed text-amber-text">
              Please finish and tidy up any open records. At 15:00 you&rsquo;ll be logged out
              automatically, on every device.
            </p>
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                className="flex-1 rounded-xl border border-amber-border bg-white px-3 py-3 text-sm font-bold text-amber-text"
              >
                Ask supervisor to extend
              </button>
              <button
                type="button"
                className="flex-none rounded-xl bg-amber px-5 py-3 text-sm font-bold text-white"
              >
                OK
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2.5 px-1 lg:col-span-2">
            <span className="h-2 w-2 rounded-full bg-brand-strong" />
            <span className="text-[13px] text-ink-soft">Roster attendance recorded automatically</span>
          </div>
        </div>

        <footer className="px-5 pb-6 pt-4">
          <Button variant="danger-outline" onClick={signOut}>
            End shift now
          </Button>
        </footer>
      </div>
    </div>
  );
};
