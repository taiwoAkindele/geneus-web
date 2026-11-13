import { beforeEach, describe, expect, it } from 'vitest';
import {
  Charge, CoverCheck, CoverSchedule, CoverageAllocation, PatientCover, PayerContractTerms, Payment, Refund, buildScheduleLines, computeAllocation,
  type AuthorizationContext, type FeeCategory,
} from '@shared';
import { chargeBalances, isAppointmentConfirmed, type BalanceCoverage } from '@/data/repos/billing';
import { coverNeedsCheck, estimatesFor, selfPayOffered, type CoverageData } from '@/data/repos/insurance';
import { rememberInsuranceSupport } from '@/data/insuranceSupport';
import { workspacesFor } from '@/app/workspaces';

// Synthetic payer, plan and prices only.
const base = { facilityId: 'QA', deviceId: 'device:one', schemaVersion: 5, createdBy: 'staff:one' };
const at = (time: string) => `2026-11-12T${time}.000Z`;
const PATIENT = 'QA-000001-K2';
const TZ = 'Africa/Lagos';
const terms = (selfPayElection?: 'allowed' | 'not_allowed') => PayerContractTerms.parse({
  payerId: 'payer:a', effectiveFrom: '2026-01-01', currency: 'NGN', selfPayElection,
  arrangements: { categories: { consultation: 'per_service' }, items: {} }, tariff: { 'fee:consult': { unitMinor: 4_000 } },
  plans: [{ planCode: 'GOLD', name: 'Synthetic gold', rules: { categories: { consultation: { coverage: 'covered', copay: { kind: 'percent', basisPoints: 1_000 } } }, items: {} } }],
});
const schedule = (t = terms()) => CoverSchedule.parse({
  ...base, id: 'cover_schedule:v1', type: 'cover_schedule', createdOn: at('08:00:00'), payerId: 'payer:a', contractId: 'contract:payer:a', contractVersionId: 'contract:payer:a:v1', contractVersion: 1,
  planCode: 'GOLD', planName: 'Synthetic gold', currency: 'NGN', effectiveFrom: t.effectiveFrom, selfPayElection: t.selfPayElection, calculationVersion: 1,
  ...buildScheduleLines(t, t.plans[0], () => 'consultation' as FeeCategory),
});
const charge = (id = 'charge:one', listPriceMinor = 5_000) => Charge.parse({ ...base, type: 'charge', id, createdOn: at('09:00:00'), patientId: PATIENT, feeItemId: 'fee:consult', description: 'Synthetic consultation', category: 'consultation', listPriceMinor, amountMinor: listPriceMinor, currency: 'NGN', appointmentId: 'appointment:one' });
const cover = PatientCover.parse({ ...base, type: 'patient_cover', id: 'cover:one', createdOn: at('08:30:00'), patientId: PATIENT, payerId: 'payer:a', planCode: 'GOLD', enrolleeNumber: 'SYN-1', relationship: 'principal', active: true });
const check = (result: CoverCheck['result'] = 'verified') => CoverCheck.parse({ ...base, type: 'cover_check', id: `check:${result}`, createdOn: at('08:45:00'), patientId: PATIENT, coverId: 'cover:one', method: 'portal', result, coversFrom: '2026-11-12', coversTo: '2026-11-12' });
const pay = (id: string, amountMinor: number, chargeId = 'charge:one') => Payment.parse({ ...base, type: 'payment', id, createdOn: at('09:10:00'), patientId: PATIENT, receiptNumber: 'QA-R-000001-K2', method: 'cash', amountMinor, currency: 'NGN', allocations: [{ chargeId, amountMinor }] });
const data = (extra: Partial<CoverageData> = {}): CoverageData => ({ covers: [], checks: [], elections: [], allocations: [], schedules: [], payers: [], refunds: [], entries: new Map(), timeZone: TZ, billingPeriods: [{ from: '2000-01-01T00:00:00.000Z' }], ...extra });
const coverage = (charges: Charge[], d: CoverageData): BalanceCoverage => ({ estimates: estimatesFor(charges, d), refunds: d.refunds });

describe('patient balances with insurance', () => {
  it('leaves a hospital without insurance exactly as before', () => {
    const c = charge();
    const [plain] = chargeBalances([c], [pay('p1', 1_000)]);
    const [withEmpty] = chargeBalances([c], [pay('p1', 1_000)], [], coverage([c], data()));
    expect(withEmpty.balanceMinor).toBe(plain.balanceMinor);
    expect(withEmpty.balanceMinor).toBe(4_000);
    expect(withEmpty.coverage).toBeUndefined();
  });
  it('keeps undecided cover out of the amount due and never blocks the booking', () => {
    const c = charge();
    const d = data({ covers: [cover], schedules: [schedule()] });
    const [row] = chargeBalances([c], [], [], coverage([c], d));
    expect([row.balanceMinor, row.undeterminedMinor, row.final]).toEqual([0, 5_000, false]);
    expect(isAppointmentConfirmed('appointment:one', [c], [], [], [c.id], coverage([c], d))).toBe(true);
    expect(isAppointmentConfirmed('appointment:one', [c], [], [], [c.id])).toBe(false);
  });
  it('during setup, verified cover is recorded but the patient is billed exactly as before', () => {
    const c = charge();
    const [plain] = chargeBalances([c], [pay('p1', 1_000)]);
    const [row] = chargeBalances([c], [pay('p1', 1_000)], [], coverage([c], data({ covers: [cover], checks: [check()], schedules: [schedule()], billingPeriods: [] })));
    expect([row.balanceMinor, row.dueMinor, row.undeterminedMinor]).toEqual([plain.balanceMinor, plain.dueMinor, 0]);
    expect(row.estimated).toBeFalsy();
  });
  it('a confirmed split still decides the balance after billing is turned off', () => {
    const c = charge();
    const allocation = CoverageAllocation.parse({ ...base, type: 'coverage_allocation', id: 'alloc:kept', createdOn: at('10:00:00'), patientId: PATIENT, chargeId: c.id, state: 'finalised', payerId: 'payer:a', arrangement: 'per_service', patientShareMinor: 400, currency: 'NGN', basis: 'exception' });
    const [row] = chargeBalances([c], [], [], coverage([c], data({ covers: [cover], checks: [check()], schedules: [schedule()], allocations: [allocation], billingPeriods: [] })));
    expect(row.balanceMinor).toBe(400);
  });
  it('asks the patient only for their estimated share once cover is verified', () => {
    const c = charge();
    const [row] = chargeBalances([c], [], [], coverage([c], data({ covers: [cover], checks: [check()], schedules: [schedule()] })));
    expect([row.dueMinor, row.balanceMinor, row.estimated, row.final]).toEqual([400, 400, true, false]);
  });
  it('turns an overpayment into a credit, and a refund settles it without touching the payment', () => {
    const c = charge();
    const allocation = CoverageAllocation.parse({ ...base, type: 'coverage_allocation', id: 'alloc:one', createdOn: at('10:00:00'), patientId: PATIENT, chargeId: c.id, state: 'finalised', payerId: 'payer:a', arrangement: 'per_service', patientShareMinor: 400, currency: 'NGN', basis: 'exception' });
    const refund = Refund.parse({ ...base, type: 'refund', id: 'refund:abcdefgh', createdOn: at('11:00:00'), patientId: PATIENT, refundNumber: 'QA-F-000001', method: 'cash', amountMinor: 600, currency: 'NGN', allocations: [{ chargeId: c.id, amountMinor: 600 }], reason: 'Synthetic' });
    const d = data({ covers: [cover], checks: [check()], schedules: [schedule()], allocations: [allocation] });
    const [credit] = chargeBalances([c], [pay('p1', 1_000)], [], coverage([c], d));
    expect([credit.balanceMinor, credit.final]).toEqual([-600, true]);
    const [settled] = chargeBalances([c], [pay('p1', 1_000)], [], coverage([c], { ...d, refunds: [refund] }));
    expect([settled.balanceMinor, settled.settledMinor, settled.refundedMinor]).toEqual([0, 1_000, 600]);
  });
});

describe('the till and the desk', () => {
  it('offers self-pay only where the contract in force allows it, or a not-eligible check is named', () => {
    const c = charge();
    expect(selfPayOffered(c, cover, data({ covers: [cover], schedules: [schedule()] }))).toBe(false);
    expect(selfPayOffered(c, cover, data({ covers: [cover], schedules: [schedule(terms('not_allowed'))] }))).toBe(false);
    expect(selfPayOffered(c, cover, data({ covers: [cover], schedules: [schedule(terms('allowed'))] }))).toBe(true);
    const notEligible = check('not_eligible');
    expect(selfPayOffered(c, cover, data({ covers: [cover], checks: [notEligible], schedules: [schedule()] }), notEligible)).toBe(true);
    expect(selfPayOffered(c, cover, data({ covers: [cover], schedules: [schedule(terms('allowed'))], timeZone: undefined }))).toBe(false);
  });
  it('prompts at check-in when an active cover is not checked for today', () => {
    const now = at('09:00:00');
    expect(coverNeedsCheck(PATIENT, data({ covers: [cover] }), now)?.id).toBe('cover:one');
    expect(coverNeedsCheck(PATIENT, data({ covers: [cover], checks: [check('pending')] }), now)).toBeUndefined();
    expect(coverNeedsCheck(PATIENT, data({ covers: [cover], timeZone: undefined }), now)).toBeUndefined();
  });
});

describe('insurance menu', () => {
  const officer = { role: 'insurance_officer', roles: ['insurance_officer'], permissions: ['coverage:confirm', 'insurance_contract:read', 'insurance_contract:manage'], facilityId: 'QA', deviceId: 'device:one' } as unknown as AuthorizationContext;
  // Unit tests run in Node: a small in-memory stand-in for the browser storage the flag lives in.
  beforeEach(() => { const store = new Map<string, string>(); Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), clear: () => store.clear() } }); });
  it('stays hidden until the server grants this device insurance', () => {
    const links = () => workspacesFor(officer).flatMap((w) => w.links.map((l) => l.to));
    expect(links()).not.toContain('/insurance');
    rememberInsuranceSupport(officer, 1);
    expect(links()).toEqual(expect.arrayContaining(['/insurance', '/insurance/contracts']));
    rememberInsuranceSupport(officer, undefined);
    expect(links()).not.toContain('/insurance');
  });
  it('never shows contracts to a cashier', () => {
    rememberInsuranceSupport(officer, 1);
    const cashier = { ...officer, role: 'cashier', roles: ['cashier'], permissions: ['payment:receive', 'coverage:elect_self_pay'] } as unknown as AuthorizationContext;
    expect(workspacesFor(cashier).flatMap((w) => w.links.map((l) => l.to))).not.toContain('/insurance/contracts');
  });
});

describe('one charge reconciled on the device, matching the server', () => {
  it('charge → cover → check → estimate → overpayment → confirmed split → refund', () => {
    const c = charge('charge:recon');
    const t = terms();
    const steps = (d: CoverageData, payments: Payment[]) => chargeBalances([c], payments, [], coverage([c], d))[0];
    let row = steps(data(), []);
    expect([row.balanceMinor, row.coverage]).toEqual([5_000, undefined]);
    row = steps(data({ covers: [cover], schedules: [schedule(t)] }), []);
    expect([row.balanceMinor, row.undeterminedMinor]).toEqual([0, 5_000]);
    row = steps(data({ covers: [cover], checks: [check()], schedules: [schedule(t)] }), []);
    expect(row.balanceMinor).toBe(400);
    const payments = [pay('p-recon', 2_000, c.id)];
    row = steps(data({ covers: [cover], checks: [check()], schedules: [schedule(t)] }), payments);
    expect([row.balanceMinor, row.final]).toEqual([-1_600, false]);
    // The server confirms with the confidential terms; the share it stores is the one the schedule predicted.
    const split = computeAllocation({ terms: t, planCode: 'GOLD', charge: c, units: 1 });
    expect(split.ok && split.split).toEqual({ arrangement: 'per_service', patientShareMinor: 400, payerShareMinor: 3_600, contractAdjustmentMinor: 1_000, capitationCoveredMinor: 0, tariffTotalMinor: 4_000 });
    const allocation = CoverageAllocation.parse({ ...base, type: 'coverage_allocation', id: 'alloc:recon', createdOn: at('10:00:00'), patientId: PATIENT, chargeId: c.id, state: 'finalised', payerId: 'payer:a', arrangement: 'per_service', patientShareMinor: 400, currency: 'NGN', basis: 'exception' });
    const confirmed = data({ covers: [cover], checks: [check()], schedules: [schedule(t)], allocations: [allocation] });
    row = steps(confirmed, payments);
    expect([row.balanceMinor, row.final]).toEqual([-1_600, true]);
    const refund = Refund.parse({ ...base, type: 'refund', id: 'refund:recon0001', createdOn: at('11:00:00'), patientId: PATIENT, refundNumber: 'QA-F-000002', method: 'cash', amountMinor: 1_600, currency: 'NGN', allocations: [{ chargeId: c.id, amountMinor: 1_600 }], reason: 'Synthetic' });
    row = steps({ ...confirmed, refunds: [refund] }, payments);
    expect([row.balanceMinor, row.settledMinor - row.refundedMinor]).toEqual([0, 400]);
    // Patient kept 400 + HMO owes 3,600 + contract adjustment 1,000 = the 5,000 list price.
    if (split.ok) expect(row.settledMinor - row.refundedMinor + split.split.payerShareMinor + split.split.contractAdjustmentMinor).toBe(c.listPriceMinor);
  });
});
