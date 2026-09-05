import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, PinDots, PinKeypad, Tag } from '@/ui';
import { useDeviceContext } from '@/data';
import { hasPin, useAuth, type RosterEntry, type SignInFailure } from '@/session';

const FAILURE_MESSAGES: Record<SignInFailure, string> = {
  'unknown-staff': 'That staff member is not on this facility’s roster',
  'wrong-pin': 'Wrong PIN — try again',
  'off-shift': 'You are not on shift right now — no shift, no access',
};

const shiftLabel = (entry: RosterEntry): string => {
  if (!entry.shift) return 'No shift today';
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${time(entry.shift.startsAt)}–${time(entry.shift.endsAt)}`;
};

const ROLE_LABELS: Record<string, string> = {
  chew: 'CHEW',
  nurse: 'Nurse',
  doctor: 'Doctor',
  records_officer: 'Records Officer',
  facility_admin: 'Facility Admin',
  supervisor: 'Supervisor',
};

/**
 * 3.2 Shift login (PIN) — evaluated against the roster already on this device,
 * so it works with no signal. No shift, no access, on any device (PRD §14.1).
 */
export const ShiftLoginScreen = () => {
  const navigate = useNavigate();
  const { facility } = useDeviceContext();
  const { roster, loading, signIn, signedIn } = useAuth();
  const [staffId, setStaffId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [failure, setFailure] = useState<SignInFailure>();
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (signedIn) navigate('/home', { replace: true });
  }, [signedIn, navigate]);

  const selected = roster.find((entry) => entry.staff.staffId === staffId);

  const choose = (entry: RosterEntry) => {
    if (hasPin(entry.staff.staffId)) {
      setStaffId(entry.staff.staffId);
      return;
    }
    navigate('/onboarding/accept', {
      state: {
        staffId: entry.staff.staffId,
        fullName: entry.staff.fullName,
        role: ROLE_LABELS[entry.staff.role] ?? entry.staff.role,
      },
    });
  };

  const onDigit = async (digit: string) => {
    if (!staffId || pin.length >= 4 || checking) return;
    setFailure(undefined);
    const next = pin + digit;
    setPin(next);
    if (next.length < 4) return;

    setChecking(true);
    const result = await signIn(staffId, next);
    if (result) {
      setFailure(result);
      setPin('');
    }
    setChecking(false);
  };

  const onDelete = () => {
    setFailure(undefined);
    setPin((current) => current.slice(0, -1));
  };

  return (
    <div className="flex min-h-screen flex-col bg-brand px-7 pb-8 pt-6 text-white sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="flex justify-end">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-on-dark">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-accent" />
            On this device
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
            <span className="text-[13px] text-brand-on-dark">{facility?.name}</span>
            <span className="rounded-full bg-white/15 px-2 py-0.5 font-mono text-[11px]">{facility?.code}</span>
          </div>

          <div className="mt-6 w-full rounded-[22px] bg-white p-5 text-ink">
            {loading ? (
              <div className="h-16 animate-pulse rounded-[14px] bg-surface-muted" />
            ) : selected ? (
              <>
                <div className="flex items-center gap-3">
                  <Avatar tone="mint">
                    {selected.staff.fullName
                      .split(' ')
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')}
                  </Avatar>
                  <div className="flex-1">
                    <div className="text-base font-bold">{selected.staff.fullName}</div>
                    <div className="text-[13px] text-ink-muted">
                      {ROLE_LABELS[selected.staff.role] ?? selected.staff.role}
                    </div>
                  </div>
                  <Tag tone={selected.shift ? 'green' : 'amber'} className="font-mono">
                    {shiftLabel(selected)}
                  </Tag>
                </div>
                <div className="my-4 h-px bg-outline-soft" />
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-ink-soft">Enter your PIN</span>
                  <button
                    type="button"
                    onClick={() => {
                      setStaffId(null);
                      setPin('');
                      setFailure(undefined);
                    }}
                    className="min-h-0 text-[13px] font-bold text-brand"
                  >
                    Not you?
                  </button>
                </div>
                <PinDots filled={pin.length} className={failure ? 'animate-shake' : ''} />
                {failure ? (
                  <div className="mt-3 text-center text-[13px] font-semibold text-danger">
                    {FAILURE_MESSAGES[failure]}
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="mb-3 text-[13px] font-semibold text-ink-soft">Who is starting a shift?</div>
                <div className="flex flex-col gap-2">
                  {roster.map((entry) => (
                    <button
                      key={entry.staff.staffId}
                      type="button"
                      onClick={() => choose(entry)}
                      className="flex items-center gap-3 rounded-[14px] border-[1.5px] border-outline-soft p-3 text-left"
                    >
                      <Avatar tone="mint">
                        {entry.staff.fullName
                          .split(' ')
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join('')}
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-bold">{entry.staff.fullName}</div>
                        <div className="text-[12px] text-ink-muted">
                          {ROLE_LABELS[entry.staff.role] ?? entry.staff.role}
                        </div>
                      </div>
                      <Tag tone={hasPin(entry.staff.staffId) && entry.shift ? 'green' : 'amber'} className="font-mono">
                        {hasPin(entry.staff.staffId) ? shiftLabel(entry) : 'Set PIN'}
                      </Tag>
                    </button>
                  ))}
                  {roster.length === 0 ? (
                    <p className="py-4 text-center text-[13px] text-ink-muted">
                      No staff on this device yet — a facility admin invites them first.
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </div>

          {selected ? (
            <div className="mt-5 w-full max-w-[300px]">
              <PinKeypad onDigit={onDigit} action={{ label: 'Delete', onPress: onDelete }} tone="dark" />
            </div>
          ) : null}

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
