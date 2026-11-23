import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, TextField, useToast } from '@/ui';
import { requestFirstPasswordCode, setFirstPassword } from '@/lib/api/staffPassword';
import { userMessage } from '@/lib/api/userMessage';
import { StaffVerification, useSession } from '@/session';
import { NewPasswordFields, newPasswordProblem } from './NewPasswordFields';
import { forgetPasswordStatus } from './SetPasswordPrompt';

/**
 * Choosing a first password while signed in: a code goes to the person's
 * verified email, and the code with the new password sets it. Needs their
 * server session, which the verification step asks for when it is missing.
 */
export const SetFirstPasswordScreen = () => (
  <div className="mx-auto w-full max-w-md px-4 py-6">
    <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Set a password</h1>
    <p className="mt-2 text-sm text-ink-muted">
      Use it to sign in on a new device or if you forget your PIN. Your PIN here stays the same.
    </p>
    <div className="mt-6">
      <StaffVerification requireServerSession purpose="Setting your password">
        <FirstPasswordForm />
      </StaffVerification>
    </div>
  </div>
);

const FirstPasswordForm = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { authorization } = useSession();
  const [sentTo, setSentTo] = useState<string>();
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

  const sendCode = () =>
    attempt(async () => {
      const sent = await requestFirstPasswordCode(authorization);
      setSentTo(sent.sentTo);
      toast(`We emailed a code to ${sent.sentTo}.`, { tone: 'success' });
    }, 'Could not send the code. Try again.');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = newPasswordProblem(password, confirmation);

    if (problem) {
      setError(problem);

      return;
    }

    void attempt(async () => {
      await setFirstPassword(authorization, code, password);
      forgetPasswordStatus(authorization.userId);
      toast('Password set.', { tone: 'success' });
      navigate('/home', { replace: true });
    }, 'Could not set your password. Try again.');
  };

  if (!sentTo) {
    return (
      <div className="space-y-4 rounded-card border border-outline-soft bg-white p-5">
        <p className="text-sm">
          First we email a 6-digit code to your verified address, to make sure it&rsquo;s you.
        </p>
        {error ? (
          <p role="alert" className="text-sm font-semibold text-danger">
            {error}
          </p>
        ) : null}
        <Button variant="primary" loading={busy} disabled={busy} onClick={() => void sendCode()}>
          Email me a code
        </Button>
      </div>
    );
  }

  return (
    <form
      className="space-y-4 rounded-card border border-outline-soft bg-white p-5"
      onSubmit={submit}
    >
      <TextField
        label={`Code we emailed to ${sentTo}`}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
        disabled={busy}
      />
      <NewPasswordFields
        label="Password"
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
        Set password
      </Button>
    </form>
  );
};
