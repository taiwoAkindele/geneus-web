import { useCallback, useEffect, useRef, useState } from 'react';
import { isDatabaseOpen } from '../database';
import { onChange } from '../db';

export type LiveQuery<T> = { data: T | undefined; loading: boolean; error: Error | undefined; reload: () => void };

/** Callers pass a stable loader; changing its inputs switches the query immediately. */
export const useLiveQuery = <T,>(load: () => Promise<T>): LiveQuery<T> => {
  const open = isDatabaseOpen();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(open);
  const [error, setError] = useState<Error>();
  const latestLoad = useRef(load);
  const generation = useRef(0);
  latestLoad.current = load;
  const run = useCallback(async () => {
    if (!isDatabaseOpen()) return;
    const request = ++generation.current;
    try {
      const result = await latestLoad.current();
      if (request !== generation.current) return;
      setData(result); setError(undefined);
    } catch (cause) {
      if (request === generation.current) setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    setData(undefined); setError(undefined); setLoading(open);
    if (!open) return;
    void run();
    const stop = onChange(() => void run());
    return () => { generation.current += 1; stop(); };
  }, [run, open, load]);
  const reload = useCallback(() => { setLoading(true); void run(); }, [run]);
  return { data, loading, error, reload };
};
