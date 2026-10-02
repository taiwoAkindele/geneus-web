import { normalizePinSetupCode, type AuthorizationContext, type PinSetupCode } from '@shared';
import { pbkdf2Base64, sameText } from '@/lib/pbkdf2';
import { allOfType, nowIso, updateRecord } from '../db';

/**
 * PIN setup codes arrive from geneus-server by sync, carrying only a hash of
 * the code, so a code an admin read out over the phone can be checked here
 * with no signal (SCHEMA.md §10).
 */
const isOpen = (code: PinSetupCode, now: number): boolean =>
  !code.usedOn && !code.revokedOn && Date.parse(code.expiresOn) > now;

/** The open code for this person that matches what they typed, if any. */
export const findMatchingCode = async (staffId: string, typed: string, now = Date.now()): Promise<PinSetupCode | undefined> => {
  const candidates = (await allOfType<PinSetupCode>('pin_setup_code')).filter(
    (code) => code.staffId === staffId && isOpen(code, now),
  );
  const normalized = normalizePinSetupCode(typed);
  for (const code of candidates) {
    if (sameText(await pbkdf2Base64(normalized, code.codeSalt, code.codeIterations), code.codeHash)) return code;
  }
  return undefined;
};

/** Marks the code used on this device, as the person it was issued for (see `claimingFor`). */
export const markCodeUsed = async (code: PinSetupCode, context: AuthorizationContext): Promise<void> => {
  await updateRecord<PinSetupCode>(context, 'pin_setup_code:claim', 'pin_setup_code', code.id, {
    usedOn: nowIso(),
    usedOnDevice: context.deviceId,
  });
};
