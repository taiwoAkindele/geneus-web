import { useState, type FormEvent } from 'react';
import { Button, TextField, useToast } from '@/ui';
import { requestInvitationAccountCode } from '@/lib/api/staff';
import type { InvitationAccount } from '@/lib/api/staffSession';
import { userMessage } from '@/lib/api/userMessage';
import { NewPasswordFields, newPasswordProblem } from './NewPasswordFields';

type Props = {
  /** Whether the invited email already has a Geneus password (they work at another facility). */
  existingAccount: boolean;
  staffId: string;
  /** The invitation code, which is the proof for asking for an emailed account code. */
  invitationCode: string;
  /** A refusal brought back from choosing the PIN, such as a wrong password. */
  error?: string;
  onReady: (account: InvitationAccount) => void;
};

/**
 * Accepting an invitation settles the person's password (SCHEMA.md §10): a new
 * email chooses its first password; an email that already has one is never
 * given a new one here — the person enters it, or a code we email them.
 * Nothing is sent yet: the server checks it with the PIN, in one step.
 */
export const InvitationAccountStep = ({
  existingAccount,
  staffId,
  invitationCode,
  error: refusal,
  onReady,
}: Props) => {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [current, setCurrent] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [codeSentTo, setCodeSentTo] = useState<string>();
  const [error, setError] = useState(refusal);
  const [sending, setSending] = useState(false);

  const chooseFirst = (event: FormEvent) => {
    event.preventDefault();
    const problem = newPasswordProblem(password, confirmation);

    if (problem) {
      setError(problem);

      return;
    }

    onReady({ password });
  };

  const confirmExisting = (event: FormEvent) => {
    event.preventDefault();

    onReady({
      existingAccount: codeSentTo ? { accountCode } : { currentPassword: current },
    });
  };

  const emailCode = async () => {
    if (sending) {
      return;
    }

    setSending(true);
    setError(undefined);

    try {
      const sent = await requestInvitationAccountCode(staffId, invitationCode);
      setCodeSentTo(sent.sentTo);
      toast(`We emailed a code to ${sent.sentTo}.`, { tone: 'success' });
    } catch (cause) {
      const message = userMessage(cause, 'Could not send the code. Try again.');
      setError(message);
      toast(message, { tone: 'error' });
    } finally {
      setSending(false);
    }
  };

  if (!existingAccount) {
    return (
      <form className="space-y-4" onSubmit={chooseFirst}>
        <p>
          Choose a password. You&rsquo;ll use it to sign in on a new device or if you forget your
          PIN.
        </p>
        <NewPasswordFields
          label="Password"
          password={password}
          confirmation={confirmation}
          onPassword={setPassword}
          onConfirmation={setConfirmation}
          error={error}
        />
        <Button type="submit" variant="primary" disabled={!password}>
          Next: choose my PIN
        </Button>
      </form>
    );
  }

  return (
    <form className="space-y-4" onSubmit={confirmExisting}>
      <p>
        Your email already has a Geneus password from another facility. Confirm it&rsquo;s you —
        your password stays the same.
      </p>
      {codeSentTo ? (
        <TextField
          label={`Code we emailed to ${codeSentTo}`}
          name="account_code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={accountCode}
          onChange={(event) => setAccountCode(event.target.value.replace(/\D/g, ''))}
          error={error}
        />
      ) : (
        <TextField
          label="Your Geneus password"
          name="current_password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          error={error}
        />
      )}
      <Button
        type="submit"
        variant="primary"
        disabled={codeSentTo ? accountCode.length !== 6 : !current}
      >
        Next: choose my PIN
      </Button>
      {codeSentTo ? null : (
        <button
          type="button"
          onClick={() => void emailCode()}
          disabled={sending}
          className="block w-full min-h-[44px] text-center text-sm font-bold text-brand underline"
        >
          {sending ? 'Sending…' : 'Forgot it? Email me a code instead'}
        </button>
      )}
    </form>
  );
};
