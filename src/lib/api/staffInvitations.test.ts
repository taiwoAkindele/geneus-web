import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthorizationContext } from '@shared';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests } from '@/lib/secureStorage';
import { saveDeviceCredential } from '@/data/deviceCredential';
import { VerificationRequired } from './insurance';
import { checkInvitationCode, invitationNeedsAttention, sendStaffInvitation } from './staff';
import {
  forgetStaffSession,
  openStaffSession,
  pendingInvitationCode,
  forgetInvitationCode,
  rememberInvitationCode,
} from './staffSession';

/**
 * The client side of staff invitations and PIN authority: calls that bind a
 * contact or hand out PIN authority carry the person's PIN-proven session,
 * never only who the device says is signed in; and an emailed invitation code
 * is held for online acceptance rather than treated like a code read aloud.
 */
const admin = {
  userId: 'staff:admin',
  deviceId: 'device:A',
  facilityId: 'A',
} as AuthorizationContext;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const lastCall = (fetch: ReturnType<typeof vi.fn>) => {
  const [url, init] = fetch.mock.calls[fetch.mock.calls.length - 1] as [string, RequestInit];

  return {
    url,
    headers: init.headers as Record<string, string>,
    body: init.body ? JSON.parse(String(init.body)) : undefined,
  };
};

beforeEach(async () => {
  vi.stubGlobal('localStorage', memoryStorage());
  resetSecureStorageForTests();
  await saveDeviceCredential({
    facilityId: 'A',
    deviceId: 'device:A',
    credential: 'device:A.synthetic',
    syncEndpoint: 'http://sync',
  });
});

afterEach(() => {
  forgetStaffSession();
  vi.unstubAllGlobals();
  resetSecureStorageForTests();
});

const signInWithServer = async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      json({
        token: 'session-token',
        staffId: admin.userId,
        expiresOn: new Date(Date.now() + 3_600_000).toISOString(),
        idleMinutes: 30,
      }),
    ),
  );

  await openStaffSession(admin, '135790');
};

describe('invitations', () => {
  it('sends the PIN-proven session when inviting someone', async () => {
    await signInWithServer();

    const fetch = vi.fn(async () =>
      json({ invitation: { id: 'i', destination: 'n•••@example.org' } }, 201),
    );

    vi.stubGlobal('fetch', fetch);
    await sendStaffInvitation(admin, 'staff:nurse', 'nurse@example.org');
    const call = lastCall(fetch);
    expect(call.url).toMatch(/\/staff\/staff%3Anurse\/invitations$/);
    expect(call.headers['x-staff-session']).toBe('session-token');
  });

  it('asks for the PIN again when the server no longer accepts the session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        json({ error: 'staff_session_required', message: 'Confirm your PIN' }, 403),
      ),
    );

    await expect(sendStaffInvitation(admin, 'staff:nurse')).rejects.toBeInstanceOf(
      VerificationRequired,
    );
  });

  it('sends an invitation to a typed address, or — leaving it out — to the verified one', async () => {
    await signInWithServer();

    const fetch = vi.fn(async () =>
      json({ invitation: { id: 'i', destination: 'a•••@example.org' } }, 201),
    );

    vi.stubGlobal('fetch', fetch);
    await sendStaffInvitation(admin, 'staff:nurse', 'nurse@example.org');
    expect(lastCall(fetch).body).toEqual({ channel: 'email', email: 'nurse@example.org' });
    await sendStaffInvitation(admin, 'staff:nurse');
    expect(lastCall(fetch).body).toEqual({ channel: 'email' });
  });

  it('checks an invitation code with the device alone: the newcomer has no PIN or session yet', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await checkInvitationCode('staff:new', 'K7M2QX9R');
    const call = lastCall(fetch);
    expect(call.headers.authorization).toBe('Bearer device:A.synthetic');
    expect(call.headers['x-staff-session']).toBeUndefined();
    expect(call.body).toEqual({ code: 'K7M2QX9R' });
  });
});

describe('a code waiting to be registered', () => {
  it('holds an invitation code until the PIN is chosen, and forgets it after', () => {
    rememberInvitationCode('staff:invited', 'EMAILED1');
    // Looking does not use it up.
    expect(pendingInvitationCode('staff:invited')).toBe('EMAILED1');
    expect(pendingInvitationCode('staff:invited')).toBe('EMAILED1');
    forgetInvitationCode('staff:invited');
    expect(pendingInvitationCode('staff:invited')).toBeUndefined();
  });
});

describe('which invitations need an administrator', () => {
  it('flags expired, locked and undeliverable ones, never a provider-accepted one still waiting', () => {
    expect(invitationNeedsAttention({ status: 'expired', delivery: 'provider_accepted' })).toBe(
      true,
    );

    expect(invitationNeedsAttention({ status: 'locked', delivery: 'provider_accepted' })).toBe(
      true,
    );

    expect(invitationNeedsAttention({ status: 'pending', delivery: 'provider_rejected' })).toBe(
      true,
    );

    expect(invitationNeedsAttention({ status: 'pending', delivery: 'provider_accepted' })).toBe(
      false,
    );

    expect(invitationNeedsAttention({ status: 'accepted', delivery: 'provider_accepted' })).toBe(
      false,
    );
  });
});
