import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PinDots, PinKeypad } from '@/ui';
import { isPinSetupApproved, PIN_LENGTH, setPin as storePin, takePinSetupApproval } from '@/session';

/** `upgrade`: they signed in with an old 4-digit PIN and are replacing it. */
type AcceptState = { staffId?: string; fullName?: string; role?: string; upgrade?: boolean };

/**
 * 3.1 Accept invite · create PIN. The staff member sets a 6-digit PIN in two
 * passes (choose, then confirm) that they'll use to sign in at the start of
 * every shift. The PIN stays on this device and never enters the replica.
 *
 * Only reachable with an approval (pinApproval.ts) — from the approval screen,
 * or straight after registering the facility for its first admin.
 */
export const CreatePinScreen = () => {
  const navigate = useNavigate();
  const { staffId, fullName, role, upgrade } = (useLocation().state ?? {}) as AcceptState;
  const [phase, setPhase] = useState<'choose' | 'confirm'>('choose');
  const [firstPin, setFirstPin] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  if (!staffId || !isPinSetupApproved(staffId)) return <Navigate to="/login" replace />;

  const onDigit = async (digit: string) => {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    if (next.length < PIN_LENGTH) {
      setPin(next);
      return;
    }
    if (phase === 'choose') {
      setFirstPin(next);
      setPhase('confirm');
      setPin('');
      setError(false);
      return;
    }
    if (next !== firstPin) {
      setError(true);
      setPin('');
      return;
    }
    if (takePinSetupApproval(staffId)) await storePin(staffId, next);
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface px-7 pb-8 pt-12 sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center text-center">
        {/* Logo — brand square with a mint plus */}
        <div className="relative mb-5 h-[52px] w-[52px] flex-none rounded-[15px] bg-brand">
          <div className="absolute left-1/2 top-1/2 h-[6.5px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand-accent-soft" />
          <div className="absolute left-1/2 top-1/2 h-[22px] w-[6.5px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand-accent-soft" />
        </div>

        <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">
          Welcome, {fullName?.split(' ')[0] ?? 'there'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {upgrade ? (
            <>PINs are now 6 digits, to keep patient records safer. Choose a new one &mdash; you&rsquo;ll use it from now on.</>
          ) : (
            <>
              You joined as a <b className="text-brand">{role ?? 'staff member'}</b>. Create a 6-digit PIN &mdash;
              you&rsquo;ll use it to sign in at the start of every shift.
            </>
          )}
        </p>

        <PinDots length={PIN_LENGTH} filled={pin.length} className="mb-2 mt-9" />
        <div className="text-[13px] text-ink-muted">
          {error ? (
            <span className="font-semibold text-danger">PINs didn&rsquo;t match — try again</span>
          ) : phase === 'choose' ? (
            'Choose your PIN'
          ) : (
            'Confirm your PIN'
          )}
        </div>

        <div className="mt-6 w-full max-w-[300px]">
          <PinKeypad
            onDigit={onDigit}
            action={{ label: 'Delete', onPress: () => setPin((current) => current.slice(0, -1)) }}
            tone="light"
          />
        </div>

        <p className="mt-auto pt-4 text-xs text-ink-muted">
          {phase === 'choose'
            ? 'You’ll confirm it once more on the next step.'
            : 'Enter the same six digits again.'}
        </p>
      </div>
    </div>
  );
};
