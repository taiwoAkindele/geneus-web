import { closesEncounter, effectiveEncounterEntries, ENCOUNTER_STEP_VALUES, linkedPatientIds, type Encounter, type EncounterEntry, type Patient, type PatientIdentityEvent, type RegisterDefinition, type RegisterEntry, type StockItem, type StockMovement } from '@shared';
import { calendarDate } from '@/lib/calendarDate';

export type MonthlyData = { encounters: Encounter[]; entries: EncounterEntry[]; patients: Patient[]; identities: PatientIdentityEvent[]; definitions: RegisterDefinition[]; registerEntries: RegisterEntry[]; items: StockItem[]; movements: StockMovement[] };
export const validMonth = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
const inMonth = (iso: string, month: string) => calendarDate(iso).slice(0, 7) === month;

export const monthlyReport = (data: MonthlyData, month: string) => {
  if (!validMonth(month)) throw new Error('Choose a valid report month.');
  const encounters = [...new Map(data.encounters.map((encounter) => [encounter.id, encounter])).values()];
  const visits = encounters.filter((encounter) => inMonth(encounter.openedOn, month));
  const ids = new Set(visits.map((encounter) => encounter.id));
  const entries = effectiveEncounterEntries(data.entries).filter((entry) => ids.has(entry.encounterId));
  // Closed by a disposition (other than observation), or by the retired follow-up and admission steps.
  const closed = new Set(entries.filter(closesEncounter).map((entry) => entry.encounterId));
  const diagnoses = new Map<string, { label: string; visits: Set<string> }>();
  for (const entry of entries.filter((entry) => entry.step === 'diagnosis')) {
    const label = ENCOUNTER_STEP_VALUES.diagnosis.parse(entry.values).diagnosis.trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const row = diagnoses.get(key) ?? { label, visits: new Set<string>() };
    row.visits.add(entry.encounterId); diagnoses.set(key, row);
  }
  const names = new Map(data.definitions.map((definition) => [definition.registerId, definition.name]));
  const registerCounts = new Map<string, number>();
  for (const entry of data.registerEntries) if (entry.entryDate.slice(0, 7) === month) registerCounts.set(entry.registerId, (registerCounts.get(entry.registerId) ?? 0) + 1);
  const movementsByItem = new Map<string, StockMovement[]>();
  for (const movement of data.movements) { const group = movementsByItem.get(movement.itemId) ?? []; group.push(movement); movementsByItem.set(movement.itemId, group); }
  const commodities = data.items.filter((item) => calendarDate(item.createdOn).slice(0, 7) <= month).map((item) => {
    const movements = movementsByItem.get(item.id) ?? [];
    const before = movements.filter((movement) => calendarDate(movement.movedOn).slice(0, 7) < month);
    const within = movements.filter((movement) => inMonth(movement.movedOn, month));
    const opening = item.quantityOnHand + before.reduce((sum, movement) => sum + movement.change, 0);
    const sum = (reason: StockMovement['reason']) => within.filter((movement) => movement.reason === reason).reduce((total, movement) => total + movement.change, 0);
    return { id: item.id, name: item.name, unit: item.unitOfMeasure ?? 'units', opening, received: sum('received'), used: -sum('dispensed'), expired: -sum('expired'), adjusted: sum('adjustment') + sum('transfer'), closing: opening + within.reduce((total, movement) => total + movement.change, 0) };
  }).sort((a, b) => a.name.localeCompare(b.name));
  const monthDate = new Date(month + '-01T12:00:00');
  const trends = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(monthDate); date.setMonth(date.getMonth() - 5 + index);
    const key = calendarDate(date).slice(0, 7);
    return { month: key, visits: encounters.filter((encounter) => inMonth(encounter.openedOn, key)).length };
  });
  return {
    visits: visits.length, completed: closed.size, inProgress: visits.length - closed.size,
    people: new Set(visits.map((encounter) => linkedPatientIds(encounter.patientId, data.identities).sort()[0])).size,
    patientRecordsCreated: data.patients.filter((patient) => inMonth(patient.createdOn, month)).length,
    diagnoses: [...diagnoses.values()].map((row) => ({ label: row.label, visits: row.visits.size })).sort((a, b) => b.visits - a.visits || a.label.localeCompare(b.label)),
    registers: [...registerCounts].map(([id, count]) => ({ id, name: names.get(id) ?? id, count })).sort((a, b) => a.name.localeCompare(b.name)),
    commodities, trends,
  };
};
