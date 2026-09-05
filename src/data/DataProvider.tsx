import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { Facility } from '@shared';
import { deviceId } from './device';
import { getFacility } from './repos/facility';
import { useLiveQuery } from './hooks/useLiveQuery';

/**
 * What this device is, and which facility it belongs to. The replica holds one
 * facility document, written when the facility is registered — until then there
 * is nothing to stamp documents with, and the app routes to onboarding.
 */
export type DeviceContext = { deviceId: string; facility: Facility | undefined };

const DeviceContextContext = createContext<DeviceContext | null>(null);

export const DataProvider = ({ children }: { children: ReactNode }) => {
  const load = useCallback(() => getFacility(), []);
  const { data, loading, error } = useLiveQuery(load);

  const value = useMemo<DeviceContext>(() => ({ deviceId: deviceId(), facility: data }), [data]);

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

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-surface text-ink-muted">Loading…</div>;
  }

  return <DeviceContextContext.Provider value={value}>{children}</DeviceContextContext.Provider>;
};

export const useDeviceContext = (): DeviceContext => {
  const device = useContext(DeviceContextContext);
  if (!device) throw new Error('useDeviceContext must be used within a DataProvider');
  return device;
};

/**
 * The identity stamped on documents written here. Only valid once a facility
 * exists; screens that write are all behind the facility and shift guards.
 */
export const useWriteContext = (staffId: string, canWrite: boolean) => {
  const { deviceId: id, facility } = useDeviceContext();
  return useMemo(
    () => ({ facilityId: facility?.code ?? '', deviceId: id, staffId, canWrite }),
    [facility?.code, id, staffId, canWrite],
  );
};
