import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, TextField, useToast } from '@/ui';
import { ApiError } from '@/lib/api/client';
import { changePassword } from '@/lib/api/staffPassword';
import { userMessage } from '@/lib/api/userMessage';
import { useSession } from '@/session';
import { NewPasswordFields, newPasswordProblem } from './NewPasswordFields';

/** Here the person is signed in, so a wrong password can only be their current one. */
const explain = (cause: unknown): string => {
  if (cause instanceof ApiError && cause.code === 'wrong_password') {
    return 'Your current password is not right.';
  }

  if (cause instanceof ApiError && cause.code === 'staff_session_required') {
    return 'Sign out and sign in again while connected, then change your password.';
  }

  return userMessage(cause, 'Could not change your password. Try again.');
};

/** Changing the signed-in person's password, online. Their PINs on every device keep working. */
export const ChangePasswordScreen = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { authorization } = useSession();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    if (busy) {
      return;
    }

    const problem = newPasswordProblem(password, confirmation);

    if (problem) {
      setError(problem);

      return;
    }

    setBusy(true);
    setError(undefined);

    try {
      await changePassword(authorization, current, password);
      toast('Password changed.', { tone: 'success' });
      navigate(-1);
    } catch (cause) {
      const message = explain(cause);
      setError(message);
      toast(message, { tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <h1 className="text-2xl font-extrabold tracking-[-0.02em]">Change password</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Your password is for new devices and a forgotten PIN. Your PIN on each device stays the
        same.
      </p>
      <form
        className="mt-6 space-y-4 rounded-card border border-outline-soft bg-white p-5"
        onSubmit={(event) => void submit(event)}
      >
        <TextField
          label="Current password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
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
        <Button type="submit" variant="primary" loading={busy} disabled={busy || !current}>
          Change password
        </Button>
      </form>
      <p className="mt-4 text-sm">
        Never set a password?{' '}
        <Link to="/account/password/set" className="font-bold text-brand underline">
          Set one now
        </Link>
      </p>
    </div>
  );
};
