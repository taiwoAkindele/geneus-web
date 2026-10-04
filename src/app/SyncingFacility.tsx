import { useSyncStatus } from '@/data';
import { PulseLoader } from '@/ui';

/** Browsers word an unreachable server differently; all mean "no route to it". */
const NETWORK_FAILURE = /failed to fetch|networkerror|load failed|network request failed/i;

/** Turns a raw sync error into something a nurse can act on. */
const describeSyncError = (error: string) =>
  NETWORK_FAILURE.test(error)
    ? 'This device could not reach the Geneus server. Check the internet connection, then reload.'
    : 'Something went wrong while bringing the facility to this device. Reload to try again.';

/**
 * An enrolled device whose facility record has not arrived yet — the one moment
 * the app has nothing local to show. Registration created the facility on the
 * server; PowerSync keeps trying to bring it down, and the tree re-renders the
 * instant it lands. While that is working it pulses; when it is not, it says
 * why and offers a reload.
 */
export const SyncingFacility = ({ facilityName }: { facilityName?: string }) => {
  const sync = useSyncStatus();
  // The browser's own flag, not `!sync.connected`: the hook starts out idle
  // (never connected) before its first read, which would flash "offline".
  const offline = !navigator.onLine;
  const title = facilityName ? `${facilityName} is registered` : 'This device is enrolled';

  if (!sync.error && !offline) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-6 text-center">
        <PulseLoader label={sync.connected ? 'Fetching your facility’s data…' : 'Connecting to Geneus…'} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6 text-center">
      <div role="alert" className="max-w-sm">
        <p className="text-base font-bold text-ink">{title}, but its data has not arrived</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {sync.error
            ? describeSyncError(sync.error)
            : 'This device is offline. Connect it to the internet, then reload.'}
        </p>
        {sync.error ? <p className="mt-3 text-xs text-ink-muted">Details: {sync.error}</p> : null}
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
