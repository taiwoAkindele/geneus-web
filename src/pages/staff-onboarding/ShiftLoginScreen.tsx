import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, PinDots, PinKeypad, Tag } from '@/ui';

/**
 * 3.2 Shift login (PIN) — the app's login. Roster-linked: no shift, no access,
 * on any device. The staff member enters their PIN to start the shift.
 */
export const ShiftLoginScreen = () => {
  const navigate = useNavigate();
  const [pin, setPin] = useState('');

  const onDigit = (d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    setPin(next);
    // On the 4th digit, sign in — land on the facility home.
    if (next.length === 4) navigate('/home');
  };

  return (
    <div className="flex min-h-screen flex-col bg-brand px-7 pb-8 pt-6 text-white sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex justify-end">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-on-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
            Synced
          </span>
        </div>

        <div className="flex flex-1 flex-col items-center pt-4">
          {/* Logo — mint square with a green plus */}
          <div className="relative mb-4 h-14 w-14 flex-none rounded-2xl bg-brand-accent-soft">
            <div className="absolute left-1/2 top-1/2 h-[7px] w-6 -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
            <div className="absolute left-1/2 top-1/2 h-6 w-[7px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
          </div>
          <div className="text-xl font-extrabold tracking-[-0.02em]">Geneus Health</div>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[13px] text-brand-on-dark">Odo-Ona Elewe PHC</span>
            <span className="rounded-full bg-white/15 px-2 py-0.5 font-mono text-[11px]">OOE-PHC</span>
          </div>

          {/* Person + PIN entry */}
          <div className="mt-6 w-full rounded-[22px] bg-white p-5 text-ink">
            <div className="flex items-center gap-3">
              <Avatar tone="mint">AO</Avatar>
              <div className="flex-1">
                <div className="text-base font-bold">Amaka Okoro</div>
                <div className="text-[13px] text-ink-muted">CHEW · Morning shift</div>
              </div>
              <Tag tone="green" className="font-mono">
                07–15
              </Tag>
            </div>
            <div className="my-4 h-px bg-outline-soft" />
            <div className="mb-3 text-[13px] font-semibold text-ink-soft">Enter your PIN</div>
            <PinDots filled={pin.length} />
          </div>

          <div className="mt-5 w-full max-w-[300px]">
            <PinKeypad
              onDigit={onDigit}
              action={{ label: 'Clear', onPress: () => setPin('') }}
              tone="dark"
            />
          </div>

          <button
            type="button"
            onClick={() => navigate('/forgot-pin')}
            className="mt-5 min-h-0 text-[13px] font-semibold text-brand-accent-soft"
          >
            Forgot PIN?
          </button>
        </div>
      </div>
    </div>
  );
};
