import { describe, expect, it } from 'vitest';
import { getPublicKeyAsync, signAsync, utils } from '@noble/ed25519';
import { rosterSignaturePayload, type RosterShift } from '@shared';
import { bytesToBase64 } from '@/lib/pbkdf2';
import { checkShiftSignature, isFrozen } from './signInChecks';

const DAY = 24 * 60 * 60 * 1000;

describe('the 7-day sync-or-freeze rule', () => {
  const now = Date.parse('2026-10-01T09:00:00Z');

  it('lets a device that synced within the week sign people in', () => {
    expect(isFrozen(new Date(now - 6 * DAY).toISOString(), now)).toBe(false);
  });

  it('freezes a device that has not synced for more than 7 days, or never has', () => {
    expect(isFrozen(new Date(now - 7 * DAY - 1).toISOString(), now)).toBe(true);
    expect(isFrozen(undefined, now)).toBe(true);
  });
});

/**
 * Signed the way geneus-server signs (src/roster/rosterSigning.ts): Ed25519
 * over the contract's payload. The key is made here, so the test proves the
 * check, not the build's configured key.
 */
describe('roster signature check', () => {
  const shift: RosterShift = {
    id: 'roster_shift:staff:nurse:2026-10-01',
    type: 'roster_shift',
    facilityId: 'OOE-PHC',
    schemaVersion: 3,
    createdBy: 'staff:admin',
    createdOn: '2026-10-01T06:00:00Z',
    deviceId: 'device-1',
    staffId: 'staff:nurse',
    startsAt: '2026-10-01T08:00:00Z',
    endsAt: '2026-10-01T16:00:00Z',
  };

  const signedBy = async (secretKey: Uint8Array, signed: RosterShift): Promise<RosterShift> => ({
    ...signed,
    signature: bytesToBase64(await signAsync(new TextEncoder().encode(rosterSignaturePayload(signed)), secretKey)),
  });

  it('accepts a shift exactly as the server signed it', async () => {
    const secretKey = utils.randomSecretKey();
    const publicKey = await getPublicKeyAsync(secretKey);

    expect(await checkShiftSignature(await signedBy(secretKey, shift), publicKey)).toBe('valid');
  });

  it('catches a shift whose end or extension was changed on the phone', async () => {
    const secretKey = utils.randomSecretKey();
    const publicKey = await getPublicKeyAsync(secretKey);
    const signed = await signedBy(secretKey, shift);

    expect(await checkShiftSignature({ ...signed, endsAt: '2026-10-01T22:00:00Z' }, publicKey)).toBe('invalid');
    expect(await checkShiftSignature({ ...signed, extendedUntil: '2026-10-01T22:00:00Z' }, publicKey)).toBe('invalid');
  });

  it('refuses a signature made with another key, and garbage', async () => {
    const publicKey = await getPublicKeyAsync(utils.randomSecretKey());

    expect(await checkShiftSignature(await signedBy(utils.randomSecretKey(), shift), publicKey)).toBe('invalid');
    expect(await checkShiftSignature({ ...shift, signature: 'bm90IGEgc2lnbmF0dXJl' }, publicKey)).toBe('invalid');
  });

  it('lets an unsigned shift through, because an offline facility must still roster staff', async () => {
    const publicKey = await getPublicKeyAsync(utils.randomSecretKey());

    expect(await checkShiftSignature(shift, publicKey)).toBe('unsigned');
  });
});
