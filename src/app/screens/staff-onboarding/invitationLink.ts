import type { InvitationLinkView } from '@/lib/api/staff';

/** The token from an invitation link's fragment (`#token=…`). The fragment never reaches a server. */
export const invitationTokenFromHash = (hash: string): string | undefined => {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token')?.trim();

  return token && /^[\w-]{20,200}$/.test(token) ? token : undefined;
};

/**
 * What opening the link on this device leads to:
 * - `done` / `unusable`: nothing more to do here (accepted; or expired, withdrawn, locked);
 * - `pin`: this device belongs to the facility, so the person goes straight to choosing their PIN;
 * - `new_device`: not set up anywhere, and the invitation may set up this one device;
 * - `add_facility`: set up for another facility, and the invitation may add this one alongside it;
 * - `switch_facility`: this browser already holds the facility, just not as the open one;
 * - `needs_device`: the invitation cannot set up a device here, so it must be opened on a facility device.
 */
export type InvitationStep =
  'done' | 'unusable' | 'pin' | 'new_device' | 'add_facility' | 'switch_facility' | 'needs_device';

export const invitationStep = (
  view: InvitationLinkView,
  device: { facilityId?: string; workspaceFacilityIds: readonly string[] },
): InvitationStep => {
  if (view.status === 'accepted') {
    return 'done';
  }

  if (view.status !== 'pending') {
    return 'unusable';
  }

  if (device.facilityId === view.facilityId) {
    return 'pin';
  }

  if (device.workspaceFacilityIds.includes(view.facilityId)) {
    return 'switch_facility';
  }

  if (view.newDevice !== 'allowed') {
    return 'needs_device';
  }

  return device.facilityId ? 'add_facility' : 'new_device';
};
