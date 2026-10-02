import { indicatorFor, useSyncStatus } from '@/data';

/**
 * An enrolled device whose facility record has not arrived yet — the one moment
 * the app has nothing local to show. Registration created the facility on the
 * server; PowerSync keeps trying to bring it down, and the tree re-renders the
 * instant it lands. Honest about why, and about the connection.
 */
export const SyncingFacility = ({ facilityName }: { facilityName?: string }) => {
  const sync = useSyncStatus();
  const indicator = indicatorFor(sync);
  const detail =
    indicator === 'offline'
      ? 'This phone is offline. Keep it connected — the facility will arrive as soon as there is signal.'
      : sync.error
        ? `The last attempt failed (${sync.error}). It is retried automatically.`
        : 'Connected — receiving the facility now.';

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6 text-center">
      <div className="max-w-sm">
        <p className="text-base font-bold text-ink">
          {facilityName ? `${facilityName} is registered` : 'This device is enrolled'}
        </p>
        <p className="mt-2 text-sm text-ink-muted">Waiting for the facility to reach this device…</p>
        <p className="mt-4 text-[13px] leading-relaxed text-ink-muted">{detail}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 min-h-0 rounded-xl border border-outline px-4 py-2.5 text-sm font-bold text-ink"
        >
          Reload
        </button>
      </div>
    </div>
  );
};
