import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSession } from '@/session';
import { deviceId } from './device';
import { seedIfEmpty } from './seed';
import type { WriteContext } from './db';

const WriteContextContext = createContext<WriteContext | null>(null);

/**
 * Supplies the facility/device/staff identity stamped on every document, and
 * makes sure the prototype's demo content exists before any screen reads.
 */
export const DataProvider = ({ children }: { children: ReactNode }) => {
  const { user, facility } = useSession();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error>();

  const context = useMemo<WriteContext>(
    () => ({ facilityId: facility.code, deviceId: deviceId(), staffId: user.staffId }),
    [facility.code, user.staffId],
  );

  useEffect(() => {
    seedIfEmpty(context)
      .catch((cause) => setError(cause instanceof Error ? cause : new Error(String(cause))))
      .finally(() => setReady(true));
  }, [context]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-6 text-center">
        <div>
          <p className="text-base font-bold text-ink">This device's records could not be opened</p>
          <p className="mt-2 text-sm text-ink-muted">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center bg-surface text-ink-muted">Loading…</div>;
  }

  return <WriteContextContext.Provider value={context}>{children}</WriteContextContext.Provider>;
};

export const useWriteContext = (): WriteContext => {
  const context = useContext(WriteContextContext);
  if (!context) throw new Error('useWriteContext must be used within a DataProvider');
  return context;
};
