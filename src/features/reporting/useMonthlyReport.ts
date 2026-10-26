import { useLiveQuery } from '@/data';
import { listEncounters, listEncounterEntries } from '@/data/repos/encounters';
import { listPatients } from '@/data/repos/patients';
import { listIdentityEvents } from '@/data/repos/patientIdentity';
import { listDefinitions, listEntries } from '@/data/repos/registers';
import { listStockItems, listStockMovements } from '@/data/repos/stock';

const load = async () => {
  const [encounters, entries, patients, identities, definitions, registerEntries, items, movements] = await Promise.all([listEncounters(), listEncounterEntries(), listPatients(), listIdentityEvents(), listDefinitions(), listEntries(), listStockItems(), listStockMovements()]);
  return { encounters, entries, patients, identities, definitions, registerEntries, items, movements };
};
export const useMonthlyReport = () => useLiveQuery(load);
