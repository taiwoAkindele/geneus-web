import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, TextField, useToast } from '@/ui';
import { useDeviceContext } from '@/data';
import {
  beginNewDeviceSignIn,
  confirmNewDeviceSignIn,
  signInWithPassword,
} from '@/lib/api/staffPassword';
import { userMessage } from '@/lib/api/userMessage';
import { roleLabel } from '@/modules/operations/staff';
import { approvePinSetup, useAuth } from '@/session';

/** Who the PIN screen sent here, when they picked their name first. */
type FromPinScreen = { staffId?: string; fullName?: string; role?: string };

type Step = 'credentials' | 'code';

/**
 * Email and password sign-in (SCHEMA.md §10). On a facility device it proves
 * the person and leads to choosing this device's PIN: for a new person here,
 * after a forgotten PIN, or after too many wrong ones. On a device set up
 * nowhere, a code emailed after the right password also sets this device up
 * for the person's primary facility. The PIN stays the everyday sign-in.
 */
export const PasswordSignInScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const from = (useLocation().state ?? {}) as FromPinScreen;
  const { deviceId, enrolled, enroll } = useDeviceContext();
  const { roster } = useAuth();
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  /** The password proved who they are: choose this device's PIN next. */
  const toPinChoice = (staffId: string) => {
    const entry = roster.find((candidate) => candidate.staff.staffId === staffId);
    approvePinSetup(staffId);
    toast('Signed in. Now choose your PIN for this device.', { tone: 'success' });
    navigate('/onboarding/accept', {
      replace: true,
      state: {
        staffId,
        fullName: entry?.staff.fullName,
        role: entry ? roleLabel(entry.staff) : undefined,
        viaPassword: true,
      },
    });
  };

  const attempt = async (action: () => Promise<void>, fallback: string) => {
    if (busy) {
      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      await action();
    } catch (cause) {
      const message = userMessage(cause, fallback);
      setError(message);
      toast(message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const submitCredentials = (event: FormEvent) => {
    event.preventDefault();

    void attempt(async () => {
      if (enrolled) {
        const session = await signInWithPassword(email, password);
        toPinChoice(session.staffId);

        return;
      }

      const challenge = await beginNewDeviceSignIn(email, password, deviceId);
      setSentTo(challenge.sentTo);
      setPassword('');
      setStep('code');
      toast(`We emailed a code to ${challenge.sentTo}.`, { tone: 'success' });
    }, 'Could not sign you in. Try again.');
  };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();

    void attempt(async () => {
      const result = await confirmNewDeviceSignIn(email, deviceId, code, label);
      // Waits (bounded) for the facility's records; the PIN screen shows the rest syncing if it is slow.
      await enroll(result.device);
      toPinChoice(result.session.staffId);
    }, 'Could not set up this device. Try again.');
  };

  const renderCredentials = () => (
    <form
      className="mt-8 space-y-4 rounded-[22px] bg-white p-5 text-ink"
      onSubmit={submitCredentials}
    >
      {from.fullName ? (
        <p className="text-[15px]">
          Signing in as <b>{from.fullName}</b>. Use the email your administrator invited.
        </p>
      ) : null}
      <TextField
        label="Email"
        name="email"
        type="email"
        autoComplete="username"
        inputMode="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        disabled={busy}
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={error}
        disabled={busy}
      />
      <Button
        type="submit"
        variant="primary"
        loading={busy}
        disabled={busy || !email.trim() || !password}
      >
        {enrolled ? 'Sign in' : 'Continue'}
      </Button>
      <Link
        to="/sign-in/forgot"
        state={{ email }}
        className="block min-h-[44px] text-center text-sm font-bold text-brand underline"
      >
        Forgot password?
      </Link>
    </form>
  );

  const renderCode = () => (
    <form className="mt-8 space-y-4 rounded-[22px] bg-white p-5 text-ink" onSubmit={submitCode}>
      <p className="text-[15px]">
        We emailed a 6-digit code to <b>{sentTo}</b>. It confirms it&rsquo;s you setting up this
        device, and works for 15 minutes.
      </p>
      <TextField
        label="Code from the email"
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
        error={error}
        disabled={busy}
      />
      <TextField
        label="Name for this device (optional)"
        name="device_label"
        placeholder="e.g. My phone"
        hint="Helps your administrator tell devices apart"
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        disabled={busy}
      />
      <Button type="submit" variant="primary" loading={busy} disabled={busy || code.length !== 6}>
        {busy ? 'Setting up and syncing…' : 'Set up this device'}
      </Button>
      <button
        type="button"
        onClick={() => {
          setStep('credentials');
          setCode('');
          setError(undefined);
        }}
        className="block w-full min-h-[44px] text-center text-sm font-bold text-brand underline"
      >
        Use a different email
      </button>
    </form>
  );

  return (
    <div className="flex min-h-screen flex-col bg-brand px-7 pb-8 pt-12 text-white sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="relative mb-7 h-14 w-14 flex-none rounded-2xl bg-brand-accent-soft">
          <div className="absolute left-1/2 top-1/2 h-[7px] w-6 -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
          <div className="absolute left-1/2 top-1/2 h-6 w-[7px] -translate-x-1/2 -translate-y-1/2 rounded bg-brand" />
        </div>

        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em]">
          Sign in with your email
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-brand-on-dark">
          {enrolled
            ? 'Then choose a PIN for this device. You’ll use the PIN to sign in from now on.'
            : 'You need an internet connection to set up this device. After that, you sign in with a PIN.'}
        </p>

        {step === 'credentials' ? renderCredentials() : renderCode()}

        <div className="mt-auto space-y-3 pt-8 text-center text-sm text-brand-on-dark">
          {enrolled ? (
            <p>
              <Link to="/login" className="font-bold text-white underline">
                Back to PIN sign-in
              </Link>
            </p>
          ) : (
            <p>
              Setting up a new facility?{' '}
              <Link to="/onboarding/start" className="font-bold text-white underline">
                Start here
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
