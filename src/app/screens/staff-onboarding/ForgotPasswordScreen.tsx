import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, TextField, useToast } from '@/ui';
import { requestPasswordReset, resetPassword } from '@/lib/api/staffPassword';
import { userMessage } from '@/lib/api/userMessage';
import { NewPasswordFields, newPasswordProblem } from './NewPasswordFields';

/**
 * Forgotten password (SCHEMA.md §10): a 6-digit code goes to the email, and the
 * code with a new password sets it. Resetting signs the person out of every
 * device; their PIN on each device is chosen again after their next password
 * sign-in. Needs one of the facility's devices, which records the reset.
 */
export const ForgotPasswordScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const initialEmail = ((useLocation().state ?? {}) as { email?: string }).email ?? '';
  const [email, setEmail] = useState(initialEmail);
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

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

  const sendCode = (event: FormEvent) => {
    event.preventDefault();

    void attempt(async () => {
      const sent = await requestPasswordReset(email);
      setSentTo(sent.sentTo);
      toast(`If ${sent.sentTo} has a Geneus account, a code is on its way.`, { tone: 'success' });
    }, 'Could not send the code. Try again.');
  };

  const reset = (event: FormEvent) => {
    event.preventDefault();
    const problem = newPasswordProblem(password, confirmation);

    if (problem) {
      setError(problem);

      return;
    }

    void attempt(async () => {
      await resetPassword(email, code, password);
      toast('Password changed. Sign in with your new password.', { tone: 'success' });
      navigate('/sign-in', { replace: true });
    }, 'Could not change your password. Try again.');
  };

  return (
    <div className="flex min-h-screen flex-col bg-brand px-7 pb-8 pt-12 text-white sm:min-h-0">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-[-0.02em]">
          Reset your password
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-brand-on-dark">
          Resetting signs you out of every device. You&rsquo;ll choose a PIN again the next time you
          sign in on each one.
        </p>

        {sentTo ? (
          <form className="mt-8 space-y-4 rounded-[22px] bg-white p-5 text-ink" onSubmit={reset}>
            <p className="text-[15px]">
              Enter the 6-digit code we sent to <b>{sentTo}</b>. It works for 15 minutes.
            </p>
            <TextField
              label="Code from the email"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              disabled={busy}
            />
            <NewPasswordFields
              password={password}
              confirmation={confirmation}
              onPassword={setPassword}
              onConfirmation={setConfirmation}
              error={error}
              disabled={busy}
            />
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              disabled={busy || code.length !== 6 || !password}
            >
              Change password
            </Button>
          </form>
        ) : (
          <form className="mt-8 space-y-4 rounded-[22px] bg-white p-5 text-ink" onSubmit={sendCode}>
            <TextField
              label="Email"
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={error}
              disabled={busy}
            />
            <Button type="submit" variant="primary" loading={busy} disabled={busy || !email.trim()}>
              Email me a code
            </Button>
          </form>
        )}

        <div className="mt-auto pt-8 text-center text-sm text-brand-on-dark">
          <Link to="/sign-in" className="font-bold text-white underline">
            Back to sign-in
          </Link>
        </div>
      </div>
    </div>
  );
};
