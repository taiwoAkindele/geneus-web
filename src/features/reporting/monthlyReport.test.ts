import { describe, expect, it } from 'vitest';
import { Encounter, EncounterEntry, StockItem, StockMovement } from '@shared';
import { monthlyReport, type MonthlyData } from './monthlyReport';

const base = { facilityId: 'TEST', createdBy: 'staff:one', createdOn: '2026-10-26T10:00:00Z', deviceId: 'device:one' };
const patientId = 'TEST-000001-K2';
const empty = (): MonthlyData => ({ encounters: [], entries: [], patients: [], identities: [], definitions: [], registerEntries: [], items: [], movements: [] });
describe('monthly operational reporting', () => {
  it('counts visits once and uses corrected diagnosis values without counting amendments as visits', () => {
    const data = empty();
    const visit = Encounter.parse({ ...base, type: 'encounter', id: 'encounter:one', patientId, openedOn: base.createdOn });
    data.encounters = [visit, visit];
    data.entries = [EncounterEntry.parse({ ...base, type: 'encounter_entry', id: 'entry:diagnosis', patientId, encounterId: visit.id, step: 'diagnosis', actorRole: 'doctor', values: { diagnosis: 'Initial diagnosis' } }), EncounterEntry.parse({ ...base, type: 'encounter_entry', id: 'entry:amendment', patientId, encounterId: visit.id, step: 'amendment', actorRole: 'doctor', amends: 'entry:diagnosis', values: { note: 'Corrected label', correctedValues: { diagnosis: 'Reviewed diagnosis' } } }), EncounterEntry.parse({ ...base, type: 'encounter_entry', id: 'entry:close', patientId, encounterId: visit.id, step: 'follow_up', actorRole: 'doctor', values: {} })];
    const report = monthlyReport(data, '2026-10');
    expect(report).toMatchObject({ visits: 1, people: 1, completed: 1, inProgress: 0 });
    expect(report.diagnoses).toEqual([{ label: 'Reviewed diagnosis', visits: 1 }]);
    expect(report.trends[report.trends.length - 1]).toEqual({ month: '2026-10', visits: 1 });
    expect(monthlyReport(data, '2026-09').visits).toBe(0);
  });
  it('calculates commodity balances by movement date and excludes later movements', () => {
    const data = empty();
    data.items = [StockItem.parse({ ...base, createdOn: '2026-08-01T10:00:00Z', type: 'stock_item', id: 'stock:one', name: 'Gloves', quantityOnHand: 10, unitOfMeasure: 'boxes' })];
    data.movements = [
      ['prior', 3, 'received', '2026-09-10'], ['received', 5, 'received', '2026-10-10'], ['used', -2, 'dispensed', '2026-10-11'], ['expired', -1, 'expired', '2026-10-12'], ['adjusted', -1, 'adjustment', '2026-10-13'], ['future', 99, 'received', '2026-11-10'],
    ].map(([id, change, reason, day]) => StockMovement.parse({ ...base, id: 'movement:' + id, type: 'stock_movement', itemId: 'stock:one', change, reason, movedOn: day + 'T10:00:00Z' }));
    expect(monthlyReport(data, '2026-10').commodities[0]).toMatchObject({ opening: 13, received: 5, used: 2, expired: 1, adjusted: -1, closing: 14, unit: 'boxes' });
    expect(() => monthlyReport(data, '2026-13')).toThrow('valid report month');
  });
});
