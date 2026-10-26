import { describe, expect, it } from 'vitest';
import { Charge, Encounter, EncounterEntry, Patient, Payment, staffPermissions } from '@shared';
import { billingSnapshot, careSnapshot, dashboardAccess } from './dashboardModel';

const at = '2026-10-26T09:00:00.000Z';
const base = { facilityId: 'QA-PHC', createdBy: 'qa-doctor', createdOn: at, updatedOn: at, deviceId: 'qa-device' };
const patientId = 'QA-PHC-000001-K2';
const patient = Patient.parse({ ...base, id: patientId, type: 'patient', patientId, fullName: 'Synthetic Patient', sex: 'female', ageYears: 30, address: 'Synthetic address' });
const charge = (id: string, currency = 'NGN') => Charge.parse({ ...base, type: 'charge', id, patientId, description: 'Consultation', feeItemId: 'fee:one', category: 'consultation', currency, listPriceMinor: 200000, amountMinor: 200000 });
const receipt = (id: string, fields = {}) => Payment.parse({ ...base, id, type: 'payment', patientId, receiptNumber: 'QA-PHC-R-000001-K2', method: 'cash', currency: 'NGN', amountMinor: 100000, allocations: [{ chargeId: 'charge:one', amountMinor: 100000 }], reason: 'Synthetic test correction', ...fields });

describe('combined dashboard', () => {
  it('combines duties without advertising clinical work to a cashier', () => {
    expect(dashboardAccess({ role: 'cashier', permissions: ['payment:receive'] })).toMatchObject({ care: false, appointments: false, billing: true, facility: false });
    const staff = { role: 'doctor' as const, additionalRoles: ['facility_admin' as const], permission: 'read_write' as const };
    expect(dashboardAccess({ role: staff.role, roles: [staff.role, ...staff.additionalRoles], permissions: staffPermissions(staff) })).toMatchObject({ care: true, appointments: true, billing: true, facility: true });
  });
  it('counts visits once by local start date and keeps earlier unfinished work', () => {
    const encounters = ['open', 'closed', 'earlier'].map((key) => Encounter.parse({ ...base, type: 'encounter', id: 'encounter:' + key, patientId, openedOn: key === 'earlier' ? '2026-10-25T09:00:00.000Z' : at }));
    const entries = [EncounterEntry.parse({ ...base, type: 'encounter_entry', id: 'entry:close', patientId, encounterId: 'encounter:closed', actorRole: 'doctor', step: 'follow_up', values: {} })];
    const snapshot = careSnapshot(encounters, entries, [patient], '2026-10-26');
    expect(snapshot.today).toBe(2);
    expect(snapshot.open.map((visit) => visit.id)).toEqual(['encounter:earlier', 'encounter:open']);
    expect(snapshot.open[0].patientName).toBe('Synthetic Patient');
  });
  it('keeps currencies separate, groups accounts and deducts today’s reversals', () => {
    const charges = [charge('charge:one'), charge('charge:two'), charge('charge:usd', 'USD')];
    const payments = [receipt('payment:one'), receipt('payment:reverse', { reverses: 'payment:one' }), receipt('payment:waiver', { method: 'waiver', amountMinor: 50000, allocations: [{ chargeId: 'charge:two', amountMinor: 50000 }] })];
    const snapshot = billingSnapshot(charges, payments, [], [patient], '2026-10-26');
    expect(snapshot.accounts).toHaveLength(2);
    expect(snapshot.accounts.find((account) => account.currency === 'NGN')?.outstanding).toBe(350000);
    expect(snapshot.accounts.find((account) => account.currency === 'USD')?.outstanding).toBe(200000);
    expect(snapshot.collected).toEqual([['NGN', 0]]);
    expect(billingSnapshot(charges, payments, [], [patient], '2026-10-27').collected).toEqual([]);
  });
});
