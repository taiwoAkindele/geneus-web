/**
 * Synthetic insurance scenario for the browser audit (qa/insurance-workflow.json).
 * Seeds one synthetic payer, contract schedule, covers and checks, and answers
 * the online insurance routes in the page with the same shared calculation the
 * server uses. The real server behaviour — verification, locks, invariants and
 * replays — is proven against PostgreSQL in geneus-server tests/insurance.test.ts;
 * this stand-in exists only so the screens can be driven end to end.
 */
import {
  CoverCheck, CoverSchedule, CoverageAllocation, Facility, Payer, PatientCover, PayerContractTerms, Refund, buildScheduleLines, computeAllocation, isRoutine, serviceDateOf,
  type FeeCategory,
} from '@shared';
import { toRow } from '@/data/rows';
import { saveDeviceCredential } from '@/data/deviceCredential';
import { rememberInsuranceSupport } from '@/data/insuranceSupport';
import { listAdjustments, listCharges, listPayments, chargeBalances } from '@/data/repos/billing';
import { estimatesFor, loadCoverage } from '@/data/repos/insurance';

type Rows = Record<string, Record<string, unknown>[]>;
type Env = { facilityId: string; deviceId: string; createdBy: string; createdOn: string; schemaVersion: number };

export const installInsuranceScenario = (db: { rows: Rows }, notify: () => void, envelope: Env, staffId: string, patients: { first: string; second: string }) => async ({ confirmed = false }: { confirmed?: boolean } = {}) => {
  const now = new Date().toISOString();
  const env = { ...envelope, schemaVersion: 5, createdOn: now };
  const today = serviceDateOf(now, 'Africa/Lagos')!;
  const terms = PayerContractTerms.parse({
    payerId: 'payer:synthetic', effectiveFrom: '2026-01-01', currency: 'NGN', selfPayElection: 'allowed',
    arrangements: { categories: { consultation: 'per_service', laboratory: 'per_service' }, items: {} },
    tariff: { 'fee:consultation': { unitMinor: 150_000 }, 'fee:lab': { unitMinor: 100_000 } },
    plans: [{ planCode: 'GOLD', name: 'Synthetic Gold plan', rules: { categories: { consultation: { coverage: 'covered', copay: { kind: 'percent', basisPoints: 1_000 } }, laboratory: { coverage: 'covered', copay: { kind: 'percent', basisPoints: 1_000 } } }, items: {} } }],
  });
  const categories: Record<string, FeeCategory> = { 'fee:consultation': 'consultation', 'fee:lab': 'laboratory' };
  db.rows.facilities = [toRow('facility', Facility.parse({ ...env, id: env.facilityId, type: 'facility', code: env.facilityId, name: 'Synthetic facility', state: 'Oyo', lga: 'Ibadan', timeZone: 'Africa/Lagos' }))];
  db.rows.payers = [toRow('payer', Payer.parse({ ...env, id: 'payer:synthetic', type: 'payer', name: 'Synthetic HMO', kind: 'hmo', code: 'SYN', active: true }))];
  db.rows.cover_schedules = [toRow('cover_schedule', CoverSchedule.parse({
    ...env, id: 'cover_schedule:synthetic:v1:GOLD', type: 'cover_schedule', payerId: 'payer:synthetic', contractId: 'contract:payer:synthetic', contractVersionId: 'contract:payer:synthetic:v1', contractVersion: 1,
    planCode: 'GOLD', planName: 'Synthetic Gold plan', currency: 'NGN', effectiveFrom: terms.effectiveFrom, selfPayElection: 'allowed', calculationVersion: 1,
    ...buildScheduleLines(terms, terms.plans[0], (id) => categories[id]),
  }))];
  const cover = (id: string, patientId: string) => toRow('patient_cover', PatientCover.parse({ ...env, id, type: 'patient_cover', patientId, payerId: 'payer:synthetic', planCode: 'GOLD', enrolleeNumber: `SYN-${id.slice(-1)}`, relationship: 'principal', active: true }));
  db.rows.patient_covers = [cover('cover:1', patients.first), cover('cover:2', patients.second)];
  db.rows.cover_checks = [toRow('cover_check', CoverCheck.parse({ ...env, id: 'check:1', type: 'cover_check', patientId: patients.first, coverId: 'cover:1', method: 'portal', reference: 'SYN-REF-1', result: 'verified', coversFrom: today, coversTo: today }))];
  db.rows.coverage_elections = []; db.rows.coverage_allocations = []; db.rows.refunds = [];
  // A consultation for the second patient, whose cover has not been checked yet.
  db.rows.charges = [...(db.rows.charges ?? []).filter((c) => c.id !== 'charge:second'), toRow('charge', { ...env, id: 'charge:second', type: 'charge', patientId: patients.second, feeItemId: 'fee:consultation', description: 'General consultation', departmentId: 'department:0', category: 'consultation', listPriceMinor: 200_000, amountMinor: 200_000, currency: 'NGN' } as never)];
  // Today's date for every seeded charge, so the checks dated today cover them.
  for (const row of db.rows.charges) row.createdOn = now;
  for (const row of db.rows.payments ?? []) row.createdOn = now;
  // Optionally start from the officer having confirmed the first patient's visit (the refund scenario).
  if (confirmed) db.rows.coverage_allocations = ([['charge:0', 15_000], ['charge:1', 10_000]] as const).map(([chargeId, share]) => toRow('coverage_allocation', CoverageAllocation.parse({
    ...env, id: `coverage_allocation:${chargeId}`, type: 'coverage_allocation', createdBy: staffId, patientId: patients.first, chargeId, state: 'finalised',
    payerId: 'payer:synthetic', arrangement: 'per_service', patientShareMinor: share, currency: 'NGN', basis: 'exception',
  })));
  await saveDeviceCredential({ deviceId: env.deviceId, facilityId: env.facilityId, credential: 'qa-credential', syncEndpoint: 'https://sync.example.org' });
  rememberInsuranceSupport(env, 1);

  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
  const insert = (table: string, type: Parameters<typeof toRow>[0], record: Record<string, unknown>) => { (db.rows[table] ??= []).push(toRow(type, record as never)); window.setTimeout(notify, 0); };
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), location.href);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const verified = (init?.headers as Record<string, string> | undefined)?.['x-workforce-access'] === 'qa-token';
    switch (url.pathname) {
      case '/workforce/access/code': return json({ sentTo: 'q•••@example.org', expiresOn: new Date(Date.now() + 900_000).toISOString() }, 202);
      case '/workforce/access/verify': return body.code === '123456' ? json({ token: 'qa-token', expiresOn: new Date(Date.now() + 900_000).toISOString() }) : json({ error: 'invalid_code', message: 'The code is invalid, expired or already used' }, 403);
      case '/workforce/access/end': return new Response(null, { status: 204 });
    }
    if (url.pathname.startsWith('/insurance/') || url.pathname === '/billing/refunds') {
      if (!verified) return json({ error: 'private_verification_required', message: 'Verify your staff email code' }, 403);
      const charges = await listCharges();
      const coverage = await loadCoverage(charges);
      const estimates = estimatesFor(charges, coverage);
      const balances = chargeBalances(charges, await listPayments(), await listAdjustments(), { estimates, refunds: coverage.refunds });
      if (url.pathname === '/insurance/allocations/confirm') {
        const outcomes = body.chargeIds.map((chargeId: string) => {
          const charge = charges.find((c) => c.id === chargeId)!; const estimate = estimates.get(chargeId)!; const row = balances.find((b) => b.charge.id === chargeId)!;
          const base = { ...env, id: `coverage_allocation:${crypto.randomUUID()}`, type: 'coverage_allocation', createdBy: staffId, patientId: charge.patientId, chargeId, currency: charge.currency, basis: body.basis };
          if (estimate.state !== 'estimated') return { chargeId, outcome: 'skipped', reason: estimate.state === 'undetermined' ? `undetermined:${estimate.reason}` : 'already_confirmed' };
          if (body.basis !== 'exception' && !isRoutine(estimate, row.settledMinor - row.refundedMinor)) return { chargeId, outcome: 'skipped', reason: 'not_routine' };
          if (body.decision === 'self_pay') { insert('coverage_allocations', 'coverage_allocation', CoverageAllocation.parse({ ...base, state: 'self_pay_confirmed', payerId: estimate.cover.payerId, patientShareMinor: charge.amountMinor })); return { chargeId, outcome: 'confirmed', state: 'self_pay_confirmed' }; }
          const split = computeAllocation({ terms, planCode: estimate.cover.planCode, charge, units: estimate.units });
          if (!split.ok || split.split.patientShareMinor !== estimate.patientShareMinor) return { chargeId, outcome: 'skipped', reason: 'schedule_mismatch' };
          insert('coverage_allocations', 'coverage_allocation', CoverageAllocation.parse({ ...base, state: 'finalised', payerId: estimate.cover.payerId, arrangement: split.split.arrangement, patientShareMinor: split.split.patientShareMinor }));
          return { chargeId, outcome: 'confirmed', state: 'finalised', patientShareMinor: split.split.patientShareMinor };
        });
        return json({ outcomes });
      }
      if (url.pathname === '/billing/refunds') {
        for (const allocation of body.allocations) {
          const row = balances.find((b) => b.charge.id === allocation.chargeId);
          if (!row || !row.final || allocation.amountMinor > -row.balanceMinor) return json({ error: 'exceeds_credit', message: 'The refund is more than the credit on this charge. Refresh the patient account' }, 409);
        }
        const refund = Refund.parse({ ...env, id: body.id, type: 'refund', createdBy: staffId, patientId: body.patientId, refundNumber: `${env.facilityId}-F-000001`, method: body.method, amountMinor: body.allocations.reduce((n: number, a: { amountMinor: number }) => n + a.amountMinor, 0), currency: body.currency, allocations: body.allocations, reason: body.reason });
        insert('refunds', 'refund', refund);
        return json(refund, 201);
      }
      if (url.pathname === '/insurance/contracts/list') return json({ versions: [{ id: 'contract:payer:synthetic:v1', facilityId: env.facilityId, contractId: 'contract:payer:synthetic', version: 1, status: 'active', terms, revision: 1, createdBy: staffId, createdOn: now, activatedBy: staffId, activatedOn: now }] });
      if (url.pathname === '/insurance/contracts/readiness') return json({ devices: [] });
      return json({ error: 'not_available', message: 'Not available in the synthetic scenario' }, 404);
    }
    return original(input, init);
  };
  notify();
  return true;
};
