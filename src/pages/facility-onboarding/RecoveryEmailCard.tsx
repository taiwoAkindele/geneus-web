import { useState } from 'react';
import { Button, TextField, useToast } from '@/ui';
import { confirmRecoveryEmail, requestRecoveryEmailCode } from '@/lib/api/staff';
import { useSession } from '@/session';

const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 6);

/**
 * The signed-in facility admin's recovery email: where a PIN code is sent if
 * they forget their PIN (SCHEMA.md §10). The address lives on the server only,
 * so this card can set it but never shows it. Replacing one already on file
 * needs a second code, sent to that address.
 */
export const RecoveryEmailCard = () => {
  const toast = useToast();
  const { user } = useSession();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<{ sentTo: string; currentSentTo?: string }>();
  const [code, setCode] = useState('');
  const [currentCode, setCurrentCode] = useState('');
  const [busy, setBusy] = useState(false);

  if (user.roleId !== 'facility_admin') return null;

  const run = async (step: () => Promise<void>, fallback: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await step();
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const sendCodes = () =>
    run(async () => {
      const result = await requestRecoveryEmailCode(user.staffId, email.trim());
      setSent(result);
      setCode('');
      setCurrentCode('');
    }, 'Could not send the code');

  const save = () =>
    run(async () => {
      await confirmRecoveryEmail(user.staffId, email.trim(), code, sent?.currentSentTo ? currentCode : undefined);
      toast('Recovery email saved');
      setEmail('');
      setSent(undefined);
    }, 'Could not save the email');

  const ready = code.length === 6 && (!sent?.currentSentTo || currentCode.length === 6);

  return (
    <div className="space-y-3 rounded-[18px] border border-outline-soft bg-white px-5 py-4">
      <div>
        <div className="text-[15px] font-bold">Recovery email</div>
        <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">
          If you forget your PIN, a PIN code can be emailed here. Add one, or change it. Needs an internet connection.
        </p>
      </div>
      <TextField
        label="Email"
        name="recovery_email"
        type="email"
        autoComplete="email"
        placeholder="e.g. amaka@example.org"
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          setSent(undefined);
        }}
      />
      {sent ? (
        <>
          <TextField
            label={`Code sent to ${sent.sentTo}`}
            name="recovery_email_code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6 digits"
            value={code}
            onChange={(event) => setCode(digitsOnly(event.target.value))}
          />
          {sent.currentSentTo ? (
            <TextField
              label={`Code sent to your current email, ${sent.currentSentTo}`}
              hint="Replacing an email needs both codes, so nobody holding this phone can redirect your recovery."
              name="recovery_email_current_code"
              inputMode="numeric"
              placeholder="6 digits"
              value={currentCode}
              onChange={(event) => setCurrentCode(digitsOnly(event.target.value))}
            />
          ) : null}
          <Button variant="primary" disabled={!ready} loading={busy} onClick={save}>
            Save email
          </Button>
        </>
      ) : (
        <Button variant="secondary" disabled={!email.trim()} loading={busy} onClick={sendCodes}>
          Send code
        </Button>
      )}
    </div>
  );
};
