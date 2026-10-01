import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, PinDots, PinKeypad, Tag } from '@/ui';
import { useDeviceContext, useSyncStatus } from '@/data';
import { lastServerContactOn } from '@/data/deviceCredential';
import { SyncPill } from '@/app/SyncPill';
import { hasPin, isFrozen, pinLength, useAuth, type RosterEntry, type SignInRefusal } from '@/session';

const minutesUntil = (at: number): number => Math.max(1, Math.ceil((at - Date.now()) / 60_000));

const failureMessage = ({ reason, retryAt }: SignInRefusal): string => {
  switch (reason) {
    case 'unknown-staff':
      return 'That staff member is not on this facility’s roster';
    case 'wrong-pin':
      return 'Wrong PIN — try again';
    case 'locked':
      return `Too many wrong PINs — try again in ${minutesUntil(retryAt ?? Date.now())} min`;
    case 'off-shift':
      return 'You are not on shift right now — no shift, no access';
    case 'sync-required':
      return 'Sign-in is paused until this phone syncs — see above';
    case 'shift-altered':
      return 'This shift was changed on this phone — ask your admin';
    case 'pin-upgrade':
      return 'PINs are now 6 digits — choose a new one';
  }
};

const lastSyncedLabel = (iso: string): string =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

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
  const [failure, setFailure] = useState<SignInRefusal>();
  const [checking, setChecking] = useState(false);
  // Re-renders on every sync status change, which is also when a check-in with
  // the server lands — so `frozen` below lifts on its own, without a reload.
  const sync = useSyncStatus();
  const lastContact = lastServerContactOn();
  const frozen = isFrozen(lastContact);

  useEffect(() => {
    if (signedIn) navigate('/home', { replace: true });
  }, [signedIn, navigate]);

  const selected = roster.find((entry) => entry.staff.staffId === staffId);
  // Old 4-digit PINs still work once, so the keypad completes at their length.
  const digits = staffId ? pinLength(staffId) : 6;

  /** Setting a PIN — first time or forgotten — always needs someone's approval first. */
  const askForApproval = (entry: RosterEntry, reset: boolean) =>
    navigate('/onboarding/approve', {
      state: {
        staffId: entry.staff.staffId,
        fullName: entry.staff.fullName,
        role: ROLE_LABELS[entry.staff.role] ?? entry.staff.role,
        reset,
      },
    });

  const choose = (entry: RosterEntry) => {
    if (hasPin(entry.staff.staffId)) {
      setStaffId(entry.staff.staffId);
      return;
    }
    askForApproval(entry, false);
  };

  const onDigit = async (digit: string) => {
    if (!staffId || pin.length >= digits || checking) return;
    setFailure(undefined);
    const next = pin + digit;
    setPin(next);
    if (next.length < digits) return;

    setChecking(true);
    const result = await signIn(staffId, next);
    if (result?.reason === 'pin-upgrade' && selected) {
      navigate('/onboarding/accept', {
        state: {
          staffId: selected.staff.staffId,
          fullName: selected.staff.fullName,
          role: ROLE_LABELS[selected.staff.role] ?? selected.staff.role,
          upgrade: true,
        },
      });
      return;
    }
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
        <div className="flex items-center justify-end gap-2">
          <SyncPill />
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

          {/* The 7-day rule (root §4.3), said before anyone types a PIN, with what the phone is doing about it. */}
          {frozen ? (
            <div role="status" className="mt-5 w-full rounded-[16px] bg-white/10 px-4 py-3 text-[13px] leading-relaxed">
              <div className="font-bold">Sign-in is paused until this phone syncs</div>
              <div className="mt-1 text-brand-on-dark">
                {lastContact
                  ? `It last reached the Geneus server on ${lastSyncedLabel(lastContact)}, more than 7 days ago. `
                  : 'It has not reached the Geneus server yet. '}
                {sync.connected
                  ? 'Connected — finishing the sync now.'
                  : 'It is trying again every few seconds. Check the internet connection; if this doesn’t change, ask your admin.'}
              </div>
            </div>
          ) : null}

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
                <PinDots length={digits} filled={pin.length} className={failure ? 'animate-shake' : ''} />
                {failure ? (
                  <div className="mt-3 text-center text-[13px] font-semibold text-danger">
                    {failure.reason === 'sync-required' && !frozen
                      ? 'This phone has synced — enter your PIN again'
                      : failureMessage(failure)}
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

          {selected ? (
            <button
              type="button"
              onClick={() => askForApproval(selected, true)}
              className="mt-5 min-h-0 text-[13px] font-semibold text-brand-accent-soft"
            >
              Forgot PIN?
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
