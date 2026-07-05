import { useNavigate } from 'react-router-dom';
import { AppBar, Button, Stat, StatusPill } from '@/ui';

/**
 * 4.10 Sync center & shift warning. Sync state is honest — nothing is lost when
 * the internet drops — and the system closes access on time, fairly.
 */
export const SyncCenterScreen = () => {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <AppBar title="Sync & device" onBack={() => navigate(-1)} right={<StatusPill status="syncing" />} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col md:max-w-lg lg:max-w-3xl">
        <div className="flex-1 space-y-5 px-5 py-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5 lg:space-y-0">
          {/* Sync status */}
          <div>
            <div className="rounded-[18px] border border-outline-soft bg-white p-4">
              <div className="mb-3.5 flex items-center justify-between">
                <span className="text-base font-bold">Syncing to cloud</span>
                <span className="font-mono text-[13px] text-slate-text">3 of 12</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-high">
                <div className="h-full w-1/4 bg-slate" />
              </div>
              <div className="mt-4 flex justify-between text-center">
                <Stat value="184" label="Saved on device" />
                <Stat value="9" label="Waiting" tone="amber" />
                <Stat value="0" label="Lost" />
              </div>
            </div>
            <p className="mx-1 mt-3.5 text-[13px] leading-relaxed text-ink-muted">
              Everything is safe on this device. Nothing is ever lost because the internet dropped.
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
          <Button variant="danger-outline" onClick={() => navigate('/login')}>
            End shift now
          </Button>
        </footer>
      </div>
    </div>
  );
};
