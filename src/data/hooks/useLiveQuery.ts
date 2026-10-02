import { useCallback, useEffect, useRef, useState } from 'react';
import { isDatabaseOpen } from '../database';
import { onChange } from '../db';

export type LiveQuery<T> = {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
};

/**
 * Reads local data and keeps it current: the query re-runs whenever the local
 * database changes, including changes arriving from sync. Reads are local, so
 * there is no network state to surface here.
 *
 * Until the device is enrolled there is no database to read (DataProvider
 * opens it only once a credential exists), and providers above the facility
 * guard still mount — so with no database open this answers "nothing, not
 * loading" and subscribes to nothing. Enrolling remounts the subtree, and the
 * query runs for real.
 */
export const useLiveQuery = <T,>(load: () => Promise<T>): LiveQuery<T> => {
  const open = isDatabaseOpen();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(open);
  const [error, setError] = useState<Error>();

  const latestLoad = useRef(load);
  latestLoad.current = load;

  const run = useCallback(async () => {
    if (!isDatabaseOpen()) return;
    try {
      setData(await latestLoad.current());
      setError(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void run();
    return onChange(() => void run());
  }, [run, open]);

  return { data, loading, error, reload: run };
};
