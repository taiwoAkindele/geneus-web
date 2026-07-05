import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PinDots, PinKeypad } from '@/ui';

/**
 * 3.1 Accept invite · create PIN. Opened from the staff invite link. The staff
 * member sets a 4-digit PIN in two passes (choose, then confirm) that they'll
 * use to sign in at the start of every shift.
 */
export const CreatePinScreen = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'choose' | 'confirm'>('choose');
  const [firstPin, setFirstPin] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  const onDigit = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    if (next.length < 4) {
      setPin(next);
      return;
    }
    // 4th digit entered — advance the flow.
    if (phase === 'choose') {
      setFirstPin(next);
      setPhase('confirm');
      setPin('');
      setError(false);
    } else if (next === firstPin) {
      navigate('/login');
    } else {
      setError(true);
      setPin('');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-surface px-7 pb-8 pt-12 sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center text-center">
        {/* Logo — brand square with a mint plus */}
        <div className="relative mb-5 h-[52px] w-[52px] flex-none rounded-[15px] bg-brand">
          <div className="absolute left-1/2 top-1/2 h-[6.5px] w-[22px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand-accent-soft" />
          <div className="absolute left-1/2 top-1/2 h-[22px] w-[6.5px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand-accent-soft" />
        </div>

        <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">Welcome, Amaka</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Odo-Ona Elewe PHC invited you as a <b className="text-brand">CHEW</b>. Create a 4-digit
          PIN — you&rsquo;ll use it to sign in at the start of every shift.
        </p>

        <PinDots filled={pin.length} className="mb-2 mt-9" />
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
            action={{ label: 'Delete', onPress: () => setPin((p) => p.slice(0, -1)) }}
            tone="light"
          />
        </div>

        <p className="mt-auto pt-4 text-xs text-ink-muted">
          {phase === 'choose'
            ? 'You’ll confirm it once more on the next step.'
            : 'Enter the same four digits again.'}
        </p>
      </div>
    </div>
  );
};
