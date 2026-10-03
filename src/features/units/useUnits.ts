import { useCallback } from 'react';
import type { Handoff, Unit } from '@shared';
import { useLiveQuery, type LiveQuery } from '@/data';
import { handoffsTo } from '@/data/repos/handoffs';
import { listUnits } from '@/data/repos/units';

const byName = (a: Unit, b: Unit) => a.name.localeCompare(b.name);

/** Every unit, active first, by name. */
export const useUnits = (): LiveQuery<Unit[]> => {
  const load = useCallback(async () => {
    const units = await listUnits();
    return [...units.filter((unit) => unit.active).sort(byName), ...units.filter((unit) => !unit.active).sort(byName)];
  }, []);
  return useLiveQuery(load);
};

/** Patients sent to a unit and not yet finished there, oldest first — the order they arrived. */
export const useIncomingHandoffs = (unitId: string | undefined): LiveQuery<Handoff[]> => {
  const load = useCallback(async () => {
    if (!unitId) return [];
    const handoffs = await handoffsTo(unitId);
    return handoffs.filter((handoff) => handoff.status !== 'done').sort((a, b) => a.createdOn.localeCompare(b.createdOn));
  }, [unitId]);
  return useLiveQuery(load);
};
