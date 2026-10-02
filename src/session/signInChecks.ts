import { verifyAsync } from '@noble/ed25519';
import { OFFLINE_AUTHORIZATION_POLICY, rosterSignaturePayload, type RosterShift } from '@shared';
import { base64ToBytes } from '@/lib/pbkdf2';

/**
 * The two checks shift login makes beyond the PIN and the shift window, both
 * offline (root §4.3).
 */

/**
 * The 7-day sync-or-freeze rule: a device that has not heard from the server
 * for longer than that stops letting anyone sign in, because the roster and
 * staff list it holds may no longer be true. Measured from the server's clock
 * at the last contact, never from the device's own record of time alone.
 */
export const isFrozen = (lastServerContactOn: string | undefined, now = Date.now()): boolean => {
  if (!lastServerContactOn) return true;
  return now - Date.parse(lastServerContactOn) > OFFLINE_AUTHORIZATION_POLICY.generalMs;
};

/** An Ed25519 public key in SPKI DER is this fixed prefix followed by the 32 key bytes. */
const ED25519_SPKI_PREFIX = '302a300506032b6570032100';

const toHex = (bytes: Uint8Array): string => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * geneus-server's public key (`npm run key:generate` prints it), built into the
 * app so a shift can be checked with no network. Without one, signatures
 * cannot be checked at all and every shift is treated as unsigned.
 */
const publicKey = ((): Uint8Array | undefined => {
  const configured = import.meta.env.VITE_SIGNING_PUBLIC_KEY;
  if (!configured) {
    console.warn('VITE_SIGNING_PUBLIC_KEY is not set: roster signatures cannot be checked on this build');
    return undefined;
  }
  const der = base64ToBytes(configured);
  if (der.length !== 44 || toHex(der.subarray(0, 12)) !== ED25519_SPKI_PREFIX) {
    console.warn('VITE_SIGNING_PUBLIC_KEY is not an Ed25519 public key: roster signatures cannot be checked');
    return undefined;
  }
  return der.subarray(12);
})();

export type ShiftSignature = 'valid' | 'unsigned' | 'invalid';

/**
 * A shift the server has signed must still match its signature. An unsigned
 * shift is allowed, because a facility with no signal must still be able to
 * roster staff (SCHEMA.md §10). A signature that does not match means the shift
 * was changed on this phone after the server signed it.
 */
export const checkShiftSignature = async (shift: RosterShift, key = publicKey): Promise<ShiftSignature> => {
  if (!shift.signature || !key) return 'unsigned';
  try {
    const signature = base64ToBytes(shift.signature);
    const message = new TextEncoder().encode(rosterSignaturePayload(shift));
    return (await verifyAsync(signature, message, key, { zip215: false })) ? 'valid' : 'invalid';
  } catch {
    return 'invalid';
  }
};
