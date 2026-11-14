import { describe, expect, it } from 'vitest';
import { Charge, CoverCheck, CoverSchedule, PatientCover, PayerContractTerms, Payment, buildScheduleLines, type FeeCategory } from '@shared';
import { chargeBalances } from '@/data/repos/billing';
import { estimatesFor, type CoverageData } from '@/data/repos/insurance';

/**
 * Billing at the scale of a busy general hospital's synced records: every
 * billing screen estimates every charge. Synthetic data only. The budget is
 * generous for a cheap Android phone; the point is that cost grows with the
 * number of charges, not charges × insurance records.
 */
const base = { facilityId: 'QA', deviceId: 'device:one', schemaVersion: 5, createdBy: 'staff:one', createdOn: '2026-11-12T09:00:00.000Z' };
const terms = PayerContractTerms.parse({
  payerId: 'payer:a', effectiveFrom: '2026-01-01', currency: 'NGN', arrangements: { categories: { consultation: 'per_service' }, items: {} }, tariff: { 'fee:consult': { unitMinor: 4_000 } },
  plans: [{ planCode: 'GOLD', name: 'Gold', rules: { categories: { consultation: { coverage: 'covered', copay: { kind: 'percent', basisPoints: 1_000 } } }, items: {} } }],
});
const schedule = CoverSchedule.parse({ ...base, id: 's', type: 'cover_schedule', payerId: 'payer:a', contractId: 'c', contractVersionId: 'c:v1', contractVersion: 1, planCode: 'GOLD', planName: 'Gold', currency: 'NGN', effectiveFrom: '2026-01-01', calculationVersion: 1, ...buildScheduleLines(terms, terms.plans[0], () => 'consultation' as FeeCategory) });

const build = (patients: number, chargesPerPatient: number, insuredShare: number) => {
  const charges: Charge[] = [], covers: PatientCover[] = [], checks: CoverCheck[] = [], payments: Payment[] = [];
  for (let p = 0; p < patients; p++) {
    const patientId = `QA-${String(p).padStart(6, '0')}-K2`;
    if (p % Math.round(1 / insuredShare) === 0) {
      covers.push(PatientCover.parse({ ...base, type: 'patient_cover', id: `cover:${p}`, patientId, payerId: 'payer:a', planCode: 'GOLD', enrolleeNumber: `E${p}`, relationship: 'principal', active: true }));
      checks.push(CoverCheck.parse({ ...base, type: 'cover_check', id: `check:${p}`, patientId, coverId: `cover:${p}`, method: 'portal', result: 'verified', coversFrom: '2026-11-12', coversTo: '2026-11-12' }));
    }
    for (let c = 0; c < chargesPerPatient; c++) {
      const id = `charge:${p}:${c}`;
      charges.push(Charge.parse({ ...base, type: 'charge', id, patientId, feeItemId: 'fee:consult', description: 'Consultation', category: 'consultation', listPriceMinor: 5_000, amountMinor: 5_000, currency: 'NGN' }));
      if (c === 0) payments.push(Payment.parse({ ...base, type: 'payment', id: `pay:${p}`, patientId, receiptNumber: 'QA-R-000001-K2', method: 'cash', amountMinor: 400, currency: 'NGN', allocations: [{ chargeId: id, amountMinor: 400 }] }));
    }
  }
  const data: CoverageData = { covers, checks, elections: [], allocations: [], schedules: [schedule], payers: [], refunds: [], entries: new Map(), timeZone: 'Africa/Lagos', billingPeriods: [{ from: '2000-01-01T00:00:00.000Z' }] };
  return { charges, payments, data };
};

describe('billing performance with insurance', () => {
  it('estimates and balances 30,000 charges for 10,000 patients, a third insured, within budget', () => {
    const { charges, payments, data } = build(10_000, 3, 1 / 3);
    const started = performance.now();
    const estimates = estimatesFor(charges, data);
    const estimated = performance.now() - started;
    const rows = chargeBalances(charges, payments, [], { estimates, refunds: [] });
    const total = performance.now() - started;
    console.log(`estimates: ${estimated.toFixed(0)} ms; estimates + balances: ${total.toFixed(0)} ms for ${charges.length} charges, ${data.covers.length} covers`);
    expect(rows.filter((r) => r.coverage).length).toBe(data.covers.length * 3);
    expect(estimated).toBeLessThan(1_500);
  });
});
