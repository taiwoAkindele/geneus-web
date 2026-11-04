import { useCallback, useMemo } from 'react';
import { visitRegisterRows, type VisitRegisterRow } from '@shared';
import { useLiveQuery } from '@/data';
import { listEncounterEntries, listEncounters } from '@/data/repos/encounters';
import { listPatients } from '@/data/repos/patients';
import { listStaff } from '@/data/repos/staff';
import { calendarDate } from '@/lib/calendarDate';
import type { RegisterDef } from './types';

/** A visit-linked register's rows, worked out from the visits on this device. */
export const useVisitRegister = (register: RegisterDef | undefined) => {
  const load = useCallback(async () => {
    const [encounters, entries, patients, staff] = await Promise.all([listEncounters(), listEncounterEntries(), listPatients(), listStaff()]);
    return { encounters, entries, patients, staffNames: new Map(staff.map((member) => [member.staffId, member.fullName])) };
  }, []);
  const query = useLiveQuery(load);
  const rows = useMemo<VisitRegisterRow[]>(() => register?.visitLink && query.data
    ? visitRegisterRows({ registerId: register.id, fields: register.fields, visitLink: register.visitLink }, { ...query.data, completions: register.completions, localDate: calendarDate })
    : [], [register, query.data]);
  return { rows, loading: query.loading, error: query.error, reload: query.reload };
};
