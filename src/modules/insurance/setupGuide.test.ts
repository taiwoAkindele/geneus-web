import { describe, expect, it } from 'vitest';
import type { InsuranceSetupItem } from '@shared';
import { guideFor } from './setupGuide';

const viewer = (userId = 'staff:admin', permissions: string[] = ['staff:manage']) => ({ userId, permissions });

describe('readiness guidance', () => {
  it('says what is missing, why, who resolves it and where — never a bare count', () => {
    const g = guideFor({ kind: 'time_zone_recorded', ok: false, requiredFor: 'billing' }, viewer());
    expect(g.status).toBe('Facility time zone has not been configured.');
    expect(g.why).toMatch(/insurance service dates/);
    expect(g.who).toBe('Facility administrator');
    expect(g.action).toEqual({ label: 'Configure time zone', to: '/facility?view=settings' });
  });
  it('names each payer that still needs a contract, with a link straight to it', () => {
    const g = guideFor({ kind: 'active_contract', ok: false, requiredFor: 'billing', count: 0, payers: [{ id: 'payer:a', name: 'Synthetic HMO' }] }, viewer());
    expect(g.steps).toEqual([{ text: 'Synthetic HMO has no active contract.', action: { label: "Set up Synthetic HMO's contract", to: '/insurance/contracts?payer=payer%3Aa' } }]);
  });
  it('guides each officer to My profile, and administrators to confirm proven addresses', () => {
    const item: InsuranceSetupItem = { kind: 'officer_with_verified_email', ok: false, requiredFor: 'billing', count: 0, people: [
      { staffId: 'staff:officer', name: 'Ifeoma', email: 'none' }, { staffId: 'staff:other', name: 'Bola', email: 'pending' },
    ] };
    const asOfficer = guideFor(item, viewer('staff:officer', []));
    expect(asOfficer.steps[0]).toEqual({ text: 'You have not added a verified email address.', action: { label: 'Add my email', to: '/profile' } });
    expect(asOfficer.steps[1].action).toBeUndefined();
    const asAdmin = guideFor(item, viewer());
    expect(asAdmin.steps[0].text).toMatch(/Ifeoma has not added an email address/);
    expect(asAdmin.steps[1].action).toEqual({ label: 'Confirm email addresses', to: '/admin?section=email' });
    expect(guideFor({ ...item, people: [] }, viewer()).steps[0].action?.to).toBe('/admin/staff');
  });
  it('explains each device that blocks billing and what to do about it', () => {
    const g = guideFor({ kind: 'devices_ready', ok: false, requiredFor: 'billing', devices: [{ deviceId: 'device:1', label: 'Front desk tablet', reasons: ['no_insurance_support', 'unsent_changes'], pendingMutationCount: 3 }] }, viewer());
    expect(g.status).toBe('1 device is not ready.');
    expect(g.steps.map((s) => s.text)).toEqual([
      expect.stringMatching(/^Front desk tablet is running an older version/),
      expect.stringMatching(/^Front desk tablet has work it has not uploaded yet \(3 changes\)\. Open Geneus/),
    ]);
    expect(g.action?.to).toBe('/admin/devices');
  });
});
