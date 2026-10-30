import { verifyAsync } from '@noble/ed25519';
import { authoritySignaturePayload, type AuthorityProof, type AuthoritySnapshot } from '@shared';
import { get } from '@/lib/api/client';
import { secureGet, secureSet } from '@/lib/secureStorage';
type VerificationKey = {
  kid?: string;
  kty?: string;
  crv?: string;
  x?: string;
};
const KEY = 'geneus.workforce.verificationKeys';
const verified = new Map<string, boolean>();
let cachedKeys = '';
const bytes = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
/** Called by background sync, never by clinical saves. Only public keys are cached. */
export const refreshWorkforceKeys = async (): Promise<void> => {
  const response = await get<{
    keys: VerificationKey[];
  }>('/.well-known/jwks.json');
  await secureSet(KEY, JSON.stringify(response.keys.filter((key) => key.kty === 'OKP' && key.crv === 'Ed25519' && key.kid && key.x)));
};
export const acceptedAuthority = async (snapshot?: AuthoritySnapshot): Promise<AuthorityProof | undefined> => {
  if (!snapshot)
    return undefined;
  try {
    const keys: VerificationKey[] = JSON.parse(secureGet(KEY) ?? '[]');
    const key = keys.find((candidate) => candidate.kid === snapshot.keyId);
    const keySet = JSON.stringify(keys);
    if (keySet !== cachedKeys) {
      verified.clear();
      cachedKeys = keySet;
    }
    const payload = authoritySignaturePayload(snapshot), cacheKey = `${snapshot.keyId}:${snapshot.signature}:${payload}`;
    if (!key?.x)
      return undefined;
    let valid = verified.get(cacheKey);
    if (valid === undefined) {
      valid = await verifyAsync(bytes(snapshot.signature), new TextEncoder().encode(payload), bytes(key.x), { zip215: false });
      if (verified.size >= 256)
        verified.clear();
      verified.set(cacheKey, valid);
    }
    if (!valid)
      return undefined;
    return { snapshot, signatureVerified: true, currentRevision: snapshot.revision };
  }
  catch {
    return undefined;
  }
};
