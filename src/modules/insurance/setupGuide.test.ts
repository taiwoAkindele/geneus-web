import { describe, expect, it } from 'vitest';
import { guideFor } from './setupGuide';

const viewer = (userId = 'staff:admin', permissions: string[] = ['staff:manage']) => ({ userId, permissions });

describe('readiness guidance', () => {
  it('says what is missing, why, who resolves it and where — never a bare count', () => {
    const g = guideFor({ kind: 'time_zone_recorded', ok: false, requiredFor: 'billing' }, viewer());
    expect(g.status).toBe('Facility time zone has not been configured.');
    expect(g.why).toMatch(/insurance service dates/);
    expect(g.who).toBe('Facility administrator');
    expect(g.action).toEqual({ label: 'Configure time zone', to: '/settings/facility?view=settings' });
  });
  it('names each payer that still needs a contract, with a link straight to it', () => {
    const g = guideFor({ kind: 'active_contract', ok: false, requiredFor: 'billing', count: 0, payers: [{ id: 'payer:a', name: 'Synthetic HMO' }] }, viewer());
    expect(g.steps).toEqual([{ text: 'Synthetic HMO has no active contract.', action: { label: "Set up Synthetic HMO's contract", to: '/settings/insurance/payers?payer=payer%3Aa' } }]);
  });
  it('names who can confirm insurance work, and says how to add someone when nobody can', () => {
    const ok = guideFor({ kind: 'officer_with_verified_email', ok: true, requiredFor: 'billing', count: 2, people: [{ staffId: 'staff:a', name: 'Ada Admin', email: 'none' }, { staffId: 'staff:o', name: 'Ifeoma', email: 'none' }] }, viewer());
    expect(ok.status).toBe('Ada Admin, Ifeoma can confirm insurance work');
    const none = guideFor({ kind: 'officer_with_verified_email', ok: false, requiredFor: 'billing', count: 0, people: [] }, viewer());
    expect(none.steps[0].action?.to).toBe('/settings/staff');
  });
  it('explains each device that blocks billing and what to do about it', () => {
    const g = guideFor({ kind: 'devices_ready', ok: false, requiredFor: 'billing', devices: [{ deviceId: 'device:1', label: 'Front desk tablet', reasons: ['no_insurance_support', 'unsent_changes'], pendingMutationCount: 3 }] }, viewer());
    expect(g.status).toBe('1 device is not ready.');
    expect(g.steps.map((s) => s.text)).toEqual([
      expect.stringMatching(/^Front desk tablet is running an older version/),
      expect.stringMatching(/^Front desk tablet has work it has not uploaded yet \(3 changes\)\. Open Geneus/),
    ]);
    expect(g.action?.to).toBe('/settings/devices');
  });
});
