import { useEffect, useState, type ReactNode } from 'react';
import { useAuthorizationContext } from '@/session';
import { Button, TextField } from '@/ui';
import { ApiError } from '@/lib/api/client';
import { enrolStaffPin, openStaffSession, staffSessionExpires, staffSessionToken, STAFF_SESSION_EVENT } from '@/lib/api/staffSession';
import { requestWorkforceCode } from '@/lib/api/workforce';
import { useSyncStatus } from '@/data';

/** Whether the server knows who is signed in on this device right now, refreshed as it changes. */
export const useStaffVerification = () => {
  const context = useAuthorizationContext();
  const [, tick] = useState(0);
  useEffect(() => {
    const refresh = () => tick((n) => n + 1);
    window.addEventListener(STAFF_SESSION_EVENT, refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => { window.removeEventListener(STAFF_SESSION_EVENT, refresh); window.clearInterval(timer); };
  }, []);
  const expiresOn = staffSessionExpires(context);
  return { verified: Boolean(staffSessionToken(context)), expiresOn, remainingMs: expiresOn ? Date.parse(expiresOn) - Date.now() : 0 };
};

const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);
const REFUSALS: Record<string, string> = {
  wrong_pin: 'That PIN is not right.', locked: 'Too many wrong PINs. Wait a few minutes, then try again.', unknown_staff: 'This account is not active here.',
  invalid_setup_code: 'That PIN code is not right, has expired or was already used. Ask your administrator for a new one.', invalid_email_code: 'That email code is not right, or has expired.',
};

/**
 * Online actions are made in the name of the person signed in, and the server
 * checks who that is from their PIN. Signing in online does this already; this
 * panel appears only when it has not happened yet (signed in offline, or idle
 * for 30 minutes) and asks for the PIN again. No emailed code is needed.
 */
export const StaffVerification = ({ children, purpose }: { children?: ReactNode; purpose: string }) => {
  const context = useAuthorizationContext();
  const sync = useSyncStatus();
  const { verified } = useStaffVerification();
  const [pin, setPin] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [enrol, setEnrol] = useState<'choose' | 'setup' | 'email'>(); const [proof, setProof] = useState(''); const [sentTo, setSentTo] = useState('');
  if (verified) return <>{children}</>;
  const online = sync.connected || (typeof navigator !== 'undefined' && navigator.onLine);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError('');
    try { await action(); setPin(''); setProof(''); setEnrol(undefined); }
    catch (cause) {
      if (cause instanceof ApiError && cause.code === 'pin_not_enrolled') { setEnrol('choose'); setError(''); }
      else setError(cause instanceof ApiError ? REFUSALS[cause.code] ?? cause.message : cause instanceof Error ? cause.message : 'Could not confirm');
    } finally { setBusy(false); }
  };
  return <section aria-label="Confirm it is you" className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
    <h2 className="font-bold">Confirm it is you</h2>
    <p className="text-sm text-ink-soft">{purpose} is saved directly on the server, in your name. Enter your PIN so the server knows who is signed in on this device.</p>
    {!online ? <p role="alert" className="text-sm text-amber-text">This needs an internet connection. Connect, then try again.</p> : null}
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {!enrol ? <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void run(() => openStaffSession(context, pin)); }}>
      <div className="w-40"><TextField label="Your PIN" type="password" inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => setPin(digits(e.target.value))} /></div>
      <Button type="submit" fullWidth={false} loading={busy} disabled={!online || pin.length !== 6}>Confirm</Button>
    </form> : <div className="space-y-3 rounded-field border border-amber-border bg-amber-bg p-3 text-sm">
      <p><strong>Your PIN is not yet registered with the server on this device.</strong> Prove it is you once, and your PIN works online from then on.</p>
      {enrol === 'choose' ? <div className="flex flex-wrap gap-2">
        <Button variant="outlined" fullWidth={false} onClick={() => setEnrol('setup')}>I have a PIN code from my administrator</Button>
        <Button variant="ghost" fullWidth={false} loading={busy} onClick={() => void (async () => { setBusy(true); setError(''); try { setSentTo((await requestWorkforceCode(context)).sentTo); setEnrol('email'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send a code'); } finally { setBusy(false); } })()}>Email me a code</Button>
      </div> : <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void run(() => enrolStaffPin(context.userId, context.deviceId, pin, enrol === 'setup' ? { setupCode: proof } : { emailCode: proof })); }}>
        {enrol === 'email' ? <p>We sent a 6-digit code to {sentTo}.</p> : null}
        <TextField label={enrol === 'setup' ? 'PIN code from your administrator' : 'Code from the email'} value={proof} onChange={(e) => setProof(enrol === 'email' ? digits(e.target.value) : e.target.value)} />
        <TextField label="Your PIN" type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(digits(e.target.value))} />
        <div className="flex gap-2"><Button type="submit" fullWidth={false} loading={busy} disabled={pin.length !== 6 || !proof.trim()}>Register my PIN</Button><Button type="button" variant="ghost" fullWidth={false} onClick={() => setEnrol('choose')}>Back</Button></div>
      </form>}
    </div>}
  </section>;
};
