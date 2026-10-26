import { useEffect, useState } from 'react';
import { getDatabase, isDatabaseOpen } from '../database';

/**
 * Sync state for the persistent indicator (root §4.3b): honest about the
 * network and about what has left the device. `pending` is PowerSync's own
 * upload queue, so "3 changes waiting" is a fact, not an estimate.
 */
export type SyncState = {
  connected: boolean;
  connecting: boolean;
  hasSynced: boolean;
  lastSyncedAt: Date | undefined;
  uploading: boolean;
  downloading: boolean;
  /** Local writes not yet accepted by the server. */
  pending: number;
  /** False when the queue has not been read, or that read failed. */
  pendingKnown?: boolean;
  error: string | undefined;
};

export type IndicatorStatus = 'synced' | 'pending' | 'syncing' | 'offline' | 'error';

const IDLE: SyncState = {
  connected: false,
  connecting: false,
  hasSynced: false,
  lastSyncedAt: undefined,
  uploading: false,
  downloading: false,
  pending: 0,
  pendingKnown: false,
  error: undefined,
};

const countPending = async (): Promise<number> => {
  const row = await getDatabase().getOptional<{ n: number }>('SELECT count(*) AS n FROM ps_crud');
  return row?.n ?? 0;
};

export const useSyncStatus = (): SyncState => {
  const [state, setState] = useState<SyncState>(IDLE);

  useEffect(() => {
    if (!isDatabaseOpen()) return;
    const db = getDatabase();
    let disposed = false;

    const refresh = async () => {
      const status = db.currentStatus;
      let pending = 0;
      let pendingKnown = true;
      try { pending = await countPending(); }
      catch { pendingKnown = false; }
      if (disposed) return;
      setState({
        connected: status.connected,
        connecting: status.connecting,
        hasSynced: status.hasSynced ?? false,
        lastSyncedAt: status.lastSyncedAt,
        uploading: status.dataFlowStatus.uploading,
        downloading: status.dataFlowStatus.downloading,
        pending,
        pendingKnown,
        error: status.dataFlowStatus.uploadError?.message ?? status.dataFlowStatus.downloadError?.message ?? (!pendingKnown ? 'The upload queue could not be read.' : undefined),
      });
    };

    void refresh();
    const stopStatus = db.registerListener({ statusChanged: () => void refresh() });
    const stopChanges = db.onChangeWithCallback({ onChange: () => void refresh() }, { tables: ['ps_crud'] });
    return () => {
      disposed = true;
      stopStatus();
      stopChanges();
    };
  }, []);

  return state;
};

/** The one-word truth for the status pill. */
export const indicatorFor = (state: SyncState): IndicatorStatus => {
  if (state.error) return 'error';
  if (state.uploading || state.downloading) return 'syncing';
  if (state.pending > 0) return state.connected ? 'syncing' : 'pending';
  if (!state.connected) return 'offline';
  if (state.connecting || !state.hasSynced) return 'syncing';
  return 'synced';
};
