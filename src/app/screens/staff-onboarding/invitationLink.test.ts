import { describe, expect, it } from 'vitest';
import type { InvitationLinkView } from '@/lib/api/staff';
import { invitationStep, invitationTokenFromHash } from './invitationLink';

const view = (over: Partial<InvitationLinkView> = {}): InvitationLinkView => ({
  staffId: 'staff:ada', staffName: 'Ada Nurse', role: 'nurse', facilityId: 'QA-PHC', facilityName: 'QA Hospital',
  expiresOn: '2026-11-16T09:00:00Z', status: 'pending', newDevice: 'not_allowed', ...over,
});
const token = 'aB3_-'.repeat(9);

describe('invitation links', () => {
  it('reads the token from the fragment only when it looks like one', () => {
    expect(invitationTokenFromHash(`#token=${token}`)).toBe(token);
    expect(invitationTokenFromHash('')).toBeUndefined();
    expect(invitationTokenFromHash('#token=short')).toBeUndefined();
    expect(invitationTokenFromHash('#token=has spaces and <tags> in it ok')).toBeUndefined();
  });
  it('goes straight to the PIN on a device of the same facility', () => {
    expect(invitationStep(view(), { facilityId: 'QA-PHC', workspaceFacilityIds: ['QA-PHC'] })).toBe('pin');
  });
  it('sets up a new device only when the invitation allows it', () => {
    expect(invitationStep(view({ newDevice: 'allowed' }), { workspaceFacilityIds: [] })).toBe('new_device');
    expect(invitationStep(view({ newDevice: 'used' }), { workspaceFacilityIds: [] })).toBe('needs_device');
    expect(invitationStep(view(), { workspaceFacilityIds: [] })).toBe('needs_device');
  });
  it('switches to a facility the browser already holds, or adds one when allowed', () => {
    expect(invitationStep(view(), { facilityId: 'OTHER', workspaceFacilityIds: ['OTHER', 'QA-PHC'] })).toBe('switch_facility');
    expect(invitationStep(view({ newDevice: 'allowed' }), { facilityId: 'OTHER', workspaceFacilityIds: ['OTHER'] })).toBe('add_facility');
    expect(invitationStep(view(), { facilityId: 'OTHER', workspaceFacilityIds: ['OTHER'] })).toBe('needs_device');
  });
  it('does nothing more for an accepted or unusable invitation', () => {
    expect(invitationStep(view({ status: 'accepted' }), { facilityId: 'QA-PHC', workspaceFacilityIds: [] })).toBe('done');
    for (const status of ['expired', 'revoked', 'locked'] as const) expect(invitationStep(view({ status, newDevice: 'allowed' }), { workspaceFacilityIds: [] })).toBe('unusable');
  });
});
