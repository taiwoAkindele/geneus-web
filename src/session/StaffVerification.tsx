import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuthorizationContext } from './SessionProvider';
import { Button, TextField } from '@/ui';
import { ApiError } from '@/lib/api/client';
import {
  enrolStaffPin,
  forgetPinGrant,
  forgetStaffSession,
  openStaffSession,
  staffSessionExpires,
  staffSessionToken,
  STAFF_SESSION_EVENT,
} from '@/lib/api/staffSession';
import { signInWithPassword } from '@/lib/api/staffPassword';
import { userMessage } from '@/lib/api/userMessage';
import { useSyncStatus } from '@/data';

/**
 * Keep the existing device-based default for operational callers. Protected
 * financial callers explicitly require hasServerSession and send its proof;
 * signing in online normally establishes that session without another prompt.
 */
export const useStaffVerification = () => {
  const context = useAuthorizationContext();
  const [, tick] = useState(0);
  useEffect(() => {
    const refresh = () => tick((n) => n + 1);
    window.addEventListener(STAFF_SESSION_EVENT, refresh);
    const timer = window.setInterval(refresh, 30_000);

    return () => {
      window.removeEventListener(STAFF_SESSION_EVENT, refresh);
      window.clearInterval(timer);
    };
  }, []);

  const expiresOn = staffSessionExpires(context);

  return {
    verified: true,
    hasServerSession: Boolean(staffSessionToken(context)),
    expiresOn,
    remainingMs: expiresOn ? Date.parse(expiresOn) - Date.now() : 0,
  };
};

const refusalText = (cause: unknown): string => {
  if (cause instanceof ApiError && REFUSALS[cause.code]) {
    return REFUSALS[cause.code];
  }

  return userMessage(cause, 'Could not confirm it is you. Try again.');
};

const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

const REFUSALS: Record<string, string> = {
  wrong_pin: 'That PIN is not right.',
  locked: 'Too many wrong PINs. Wait a few minutes, then try again.',
  unknown_staff: 'This account is not active here.',
};

/**
 * Registers the PIN the person just typed with the server, proven by their email
 * and password: for a PIN set on this device before the server knew it. Their
 * password must be their own — not someone else's who happens to know it.
 */
const registerWithPassword = async (
  context: { userId: string; deviceId: string },
  email: string,
  password: string,
  pin: string,
) => {
  const session = await signInWithPassword(email, password);

  if (session.staffId !== context.userId) {
    forgetPinGrant(session.staffId);
    forgetStaffSession();

    throw new Error('That email belongs to someone else. Use your own email and password.');
  }

  await enrolStaffPin(context.userId, context.deviceId, pin, { pinGrant: session.pinGrant });
  forgetPinGrant(context.userId);
};

/**
 * Online actions are made in the name of the person signed in, and the server
 * checks who that is from their PIN. Signing in online does this already; this
 * panel appears only when it has not happened yet (signed in offline, or idle
 * for 30 minutes) and asks for the PIN again. No emailed code is needed.
 *
 * `requireServerSession`: for financial actions, contact binding or PIN authority,
 * where the server accepts only a PIN-proven session — never just the person
 * the device says is signed in — the panel shows until that session exists.
 */
export const StaffVerification = ({
  children,
  purpose,
  requireServerSession = false,
}: {
  children?: ReactNode;
  purpose: string;
  requireServerSession?: boolean;
}) => {
  const context = useAuthorizationContext();
  const sync = useSyncStatus();
  const { verified: deviceVerified, hasServerSession } = useStaffVerification();
  const verified = deviceVerified && (!requireServerSession || hasServerSession);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // The server has never seen this PIN: the person proves it is them with their password, once.
  const [registering, setRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const previouslyVerified = useRef(false);

  if (verified) {
    previouslyVerified.current = true;
  }

  if (verified && !requireServerSession) {
    return <>{children}</>;
  }

  const online = sync.connected || (typeof navigator !== 'undefined' && navigator.onLine);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');

    try {
      await action();
      setPin('');
      setPassword('');
      setRegistering(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'pin_not_enrolled') {
        setRegistering(true);
        setError('');
      } else {
        setError(refusalText(cause));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section
        hidden={verified}
        aria-label="Confirm it is you"
        className="space-y-3 rounded-card border border-outline-soft bg-white p-4"
      >
        <h2 className="font-bold">Confirm it is you</h2>
        <p className="text-sm text-ink-soft">
          {purpose} is saved directly on the server, in your name. Enter your PIN so the server
          knows who is signed in on this device.
        </p>
        {!online ? (
          <p role="alert" className="text-sm text-amber-text">
            This needs an internet connection. Connect, then try again.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {!registering ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => openStaffSession(context, pin));
            }}
          >
            <div className="w-40">
              <TextField
                label="Your PIN"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={(e) => setPin(digits(e.target.value))}
              />
            </div>
            <Button
              type="submit"
              fullWidth={false}
              loading={busy}
              disabled={!online || pin.length !== 6}
            >
              Confirm
            </Button>
          </form>
        ) : (
          <form
            className="space-y-3 rounded-field border border-amber-border bg-amber-bg p-3 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => registerWithPassword(context, email, password, pin));
            }}
          >
            <p>
              <strong>Your PIN is not yet registered with the server on this device.</strong> Sign
              in with your email and password once, and your PIN works online from then on.
            </p>
            <TextField
              label="Email"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <TextField
              label="Your PIN"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(digits(e.target.value))}
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                fullWidth={false}
                loading={busy}
                disabled={!online || pin.length !== 6 || !email.trim() || !password}
              >
                Register my PIN
              </Button>
              <Button
                type="button"
                variant="ghost"
                fullWidth={false}
                onClick={() => setRegistering(false)}
              >
                Back
              </Button>
            </div>
          </form>
        )}
      </section>
      <div hidden={!verified}>{verified || previouslyVerified.current ? children : null}</div>
    </>
  );
};
