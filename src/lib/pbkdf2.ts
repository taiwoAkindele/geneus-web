/**
 * PBKDF2-SHA-256 through the browser's own WebCrypto — no dependency. Used for
 * the PINs this device keeps and for checking a PIN setup code against the
 * hash geneus-server synced down, which the server computes the same way
 * (geneus-server/src/staff/pinSetupCodes.ts).
 */
const HASH_BITS = 256;

export const base64ToBytes = (base64: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

export const bytesToBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));

export const randomSalt = (): string => bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));

export const pbkdf2Base64 = async (secret: string, saltBase64: string, iterations: number): Promise<string> => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: base64ToBytes(saltBase64), iterations },
    key,
    HASH_BITS,
  );
  return bytesToBase64(new Uint8Array(bits));
};

/** Compares without stopping at the first difference, so timing says nothing about how close a guess was. */
export const sameText = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
};
