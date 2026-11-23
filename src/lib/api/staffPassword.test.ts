import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@/lib/testing/memoryStorage';
import { resetSecureStorageForTests } from '@/lib/secureStorage';
import { saveDeviceCredential } from '@/data/deviceCredential';
import { newPasswordProblem } from '@/app/screens/staff-onboarding/NewPasswordFields';
import { accountTag } from '@/modules/operations/staff';
import { ApiError } from './client';
import { checkInvitationCode, requestInvitationAccountCode } from './staff';
import {
  beginNewDeviceSignIn,
  changePassword,
  confirmNewDeviceSignIn,
  ownPasswordStatus,
  setFirstPassword,
  signInWithPassword,
} from './staffPassword';
import { forgetStaffSession, pendingPinGrant, staffSessionToken } from './staffSession';
import { userMessage } from './userMessage';

/**
 * The client side of staff passwords: a sign-in holds the server session and
 * the permission to choose this device's PIN; a device enrolled nowhere signs
 * in with no credential at all; and every refusal reads as plain guidance.
 */
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

const passwordSession = (staffId: string) => ({
  token: `session-${staffId}`,
  staffId,
  expiresOn: new Date(Date.now() + 3_600_000).toISOString(),
  idleMinutes: 30,
  pinGrant: `grant-${staffId}`,
  pinGrantExpiresOn: new Date(Date.now() + 600_000).toISOString(),
});

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  resetSecureStorageForTests();
});

afterEach(() => {
  forgetStaffSession();
  vi.unstubAllGlobals();
  resetSecureStorageForTests();
});

const enrolHere = () =>
  saveDeviceCredential({
    facilityId: 'A',
    deviceId: 'device:A',
    credential: 'device:A.synthetic',
    syncEndpoint: 'http://sync',
  });

describe('signing in with a password', () => {
  it('on a facility device: sends the device, and holds the session and the PIN permission', async () => {
    await enrolHere();
    const fetch = vi.fn(async () => json(passwordSession('staff:nurse')));
    vi.stubGlobal('fetch', fetch);

    await signInWithPassword('nurse@example.org', 'correct horse');

    const call = lastCall(fetch);
    expect(call.url).toMatch(/\/staff\/password\/sign-in$/);
    expect(call.headers.authorization).toBe('Bearer device:A.synthetic');
    expect(call.body).toEqual({ email: 'nurse@example.org', password: 'correct horse' });
    expect(staffSessionToken({ userId: 'staff:nurse', deviceId: 'device:A' })).toBe(
      'session-staff:nurse',
    );
    expect(pendingPinGrant('staff:nurse')).toBe('grant-staff:nurse');
  });

  it('on a device set up nowhere: no credential, then the emailed code enrols it', async () => {
    const begin = vi.fn(async () => json({ sentTo: 'n•••@example.org', expiresOn: '' }, 202));
    vi.stubGlobal('fetch', begin);

    await beginNewDeviceSignIn('nurse@example.org', 'correct horse', 'device:new');

    const first = lastCall(begin);
    expect(first.url).toMatch(/\/devices\/password-sign-in$/);
    expect(first.headers.authorization).toBeUndefined();
    expect(first.body).toEqual({
      email: 'nurse@example.org',
      password: 'correct horse',
      deviceId: 'device:new',
    });

    const device = {
      deviceId: 'device:new',
      facilityId: 'B',
      credential: 'device:new.secret',
      syncEndpoint: 'http://sync',
    };

    const confirm = vi.fn(async () =>
      json({ device, session: passwordSession('staff:at-B') }, 201),
    );

    vi.stubGlobal('fetch', confirm);

    const result = await confirmNewDeviceSignIn('nurse@example.org', 'device:new', '123456', ' ');

    expect(lastCall(confirm).body).toEqual({
      email: 'nurse@example.org',
      deviceId: 'device:new',
      code: '123456',
    });
    expect(result.device).toEqual(device);
    expect(pendingPinGrant('staff:at-B')).toBe('grant-staff:at-B');
  });

  it('changes the password with the signed-in session', async () => {
    await enrolHere();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(passwordSession('staff:nurse'))),
    );
    await signInWithPassword('nurse@example.org', 'correct horse');

    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    await changePassword({ userId: 'staff:nurse', deviceId: 'device:A' }, 'old one', 'new one!!');

    const call = lastCall(fetch);
    expect(call.headers['x-staff-session']).toBe('session-staff:nurse');
    expect(call.body).toEqual({ currentPassword: 'old one', password: 'new one!!' });
  });
});

describe('invitations to an email that already has a password', () => {
  it('learns from the code check, and asks for an account code with the device alone', async () => {
    await enrolHere();
    const check = vi.fn(async () => json({ existingAccount: true }));
    vi.stubGlobal('fetch', check);

    expect(await checkInvitationCode('staff:new', 'K7M2QX9R')).toEqual({ existingAccount: true });

    const send = vi.fn(async () => json({ sentTo: 'n•••@example.org', expiresOn: '' }, 202));
    vi.stubGlobal('fetch', send);
    await requestInvitationAccountCode('staff:new', 'K7M2QX9R');

    const call = lastCall(send);
    expect(call.url).toMatch(/\/staff\/staff%3Anew\/invitations\/account-code$/);
    expect(call.headers['x-staff-session']).toBeUndefined();
    expect(call.body).toEqual({ code: 'K7M2QX9R' });
  });
});

describe('what the person reads', () => {
  it('words every password refusal plainly, though server messages naming a password are hidden', () => {
    for (const code of [
      'wrong_password',
      'locked',
      'not_at_facility',
      'invalid_pin_grant',
      'existing_account',
      'invalid_account_code',
    ]) {
      const message = userMessage(new ApiError(code, 'raw server text', 403), 'fallback');

      expect(message).not.toBe('fallback.');
      expect(message).not.toContain('raw server text');
    }
  });

  it('checks a new password before it is sent', () => {
    expect(newPasswordProblem('short', 'short')).toMatch(/at least 8/);
    expect(newPasswordProblem('long enough', 'long enougj')).toMatch(/don’t match/);
    expect(newPasswordProblem('long enough', 'long enough')).toBeUndefined();
  });
});

describe('a first password for staff who signed in before passwords', () => {
  it('asks, requests a code and sets it with the signed-in session', async () => {
    await enrolHere();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json(passwordSession('staff:nurse'))),
    );
    await signInWithPassword('nurse@example.org', 'correct horse');
    const context = { userId: 'staff:nurse', deviceId: 'device:A' };

    const status = vi.fn(async () => json({ email: 'n•••@example.org', hasPassword: false }));
    vi.stubGlobal('fetch', status);
    expect(await ownPasswordStatus(context)).toEqual({
      email: 'n•••@example.org',
      hasPassword: false,
    });
    expect(lastCall(status).headers['x-staff-session']).toBe('session-staff:nurse');

    const set = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', set);
    await setFirstPassword(context, '123456', 'my first password');
    expect(lastCall(set).url).toMatch(/\/staff\/me\/password$/);
    expect(lastCall(set).body).toEqual({ code: '123456', password: 'my first password' });
  });

  it('flags, for administrators, who cannot yet set up a device or recover a PIN themselves', () => {
    const base = { staffId: 's', activated: true };

    expect(accountTag({ ...base, hasEmail: false, passwordSet: false })?.label).toBe('No email');
    expect(accountTag({ ...base, hasEmail: true, passwordSet: false })?.label).toBe(
      'No password yet',
    );
    expect(accountTag({ ...base, hasEmail: true, passwordSet: true })).toBeUndefined();
    expect(accountTag(undefined)).toBeUndefined();
  });
});
