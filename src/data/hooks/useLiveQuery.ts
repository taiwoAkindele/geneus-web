import { useCallback, useEffect, useRef, useState } from 'react';
import { onChange } from '../db';

export type LiveQuery<T> = {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
  reload: () => void;
};

/**
 * Reads local data and keeps it current: the query re-runs whenever the replica
 * changes, including changes arriving from sync. Reads are local, so there is no
 * network state to surface here.
 */
export const useLiveQuery = <T,>(load: () => Promise<T>): LiveQuery<T> => {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error>();

  const latestLoad = useRef(load);
  latestLoad.current = load;

  const run = useCallback(async () => {
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
    void run();
    return onChange(() => void run());
  }, [run]);

  return { data, loading, error, reload: run };
};
