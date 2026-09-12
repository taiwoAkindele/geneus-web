import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DeviceCredential, Facility } from '@shared';
import { deviceId as localDeviceId } from './device';
import { getDeviceCredential, saveDeviceCredential } from './deviceCredential';
import { getFacility } from './repos/facility';
import { useLiveQuery } from './hooks/useLiveQuery';
import { startSync, waitForFirstSync } from './sync';

/**
 * What this device is, and which facility it belongs to.
 *
 * An unenrolled device holds no credential, opens no database and can only
 * register a facility — the PowerSync client is not even loaded for it. Once a
 * credential exists the database is opened, PowerSync connected, and the
 * facility read from the local replica, where registration put it by sync.
 */
export type DeviceContext = {
  deviceId: string;
  facility: Facility | undefined;
  enrolled: boolean;
  /**
   * Stores a freshly issued credential, opens the database and waits (bounded)
   * for the first sync. Resolves when the facility can be read locally.
   */
  enroll: (credential: DeviceCredential) => Promise<void>;
};

const DeviceContextContext = createContext<DeviceContext | null>(null);

const Screen = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-screen items-center justify-center bg-surface px-6 text-center text-ink-muted">{children}</div>
);

/** Mounted only once the database is open: reads the facility live. */
const EnrolledDevice = ({ credential, enroll, children }: { credential: DeviceCredential; enroll: DeviceContext['enroll']; children: ReactNode }) => {
  const load = useCallback(() => getFacility(), []);
  const { data, loading, error } = useLiveQuery(load);
  const value = useMemo<DeviceContext>(
    () => ({ deviceId: credential.deviceId, facility: data, enrolled: true, enroll }),
    [credential.deviceId, data, enroll],
  );

  if (error) {
    return (
      <Screen>
        <div>
          <p className="text-base font-bold text-ink">This device's records could not be opened</p>
          <p className="mt-2 text-sm">{error.message}</p>
        </div>
      </Screen>
    );
  }
  if (loading) return <Screen>Loading…</Screen>;
  return <DeviceContextContext.Provider value={value}>{children}</DeviceContextContext.Provider>;
};

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const [credential, setCredential] = useState<DeviceCredential | undefined>(() => getDeviceCredential());
  const [open, setOpen] = useState(false);
  const [failure, setFailure] = useState<Error>();

  useEffect(() => {
    if (!credential) return;
    let cancelled = false;
    startSync().then(
      () => {
        if (!cancelled) setOpen(true);
      },
      (cause: unknown) => {
        if (!cancelled) setFailure(cause instanceof Error ? cause : new Error(String(cause)));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [credential]);

  const enroll = useCallback(async (issued: DeviceCredential) => {
    saveDeviceCredential(issued);
    const db = await startSync();
    await waitForFirstSync(db);
    setCredential(issued);
    setOpen(true);
  }, []);

  const unenrolled = useMemo<DeviceContext>(
    () => ({ deviceId: localDeviceId(), facility: undefined, enrolled: false, enroll }),
    [enroll],
  );

  if (failure) {
    return (
      <Screen>
        <div>
          <p className="text-base font-bold text-ink">This device's records could not be opened</p>
          <p className="mt-2 text-sm">{failure.message}</p>
        </div>
      </Screen>
    );
  }
  if (!credential) return <DeviceContextContext.Provider value={unenrolled}>{children}</DeviceContextContext.Provider>;
  if (!open) return <Screen>Opening records…</Screen>;
  return (
    <EnrolledDevice credential={credential} enroll={enroll}>
      {children}
    </EnrolledDevice>
  );
};

export const useDeviceContext = (): DeviceContext => {
  const device = useContext(DeviceContextContext);
  if (!device) throw new Error('useDeviceContext must be used within a DataProvider');
  return device;
};
