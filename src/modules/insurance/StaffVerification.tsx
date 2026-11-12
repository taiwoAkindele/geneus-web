import { useEffect, useState, type ReactNode } from 'react';
import { useAuthorizationContext } from '@/session';
import { Button, TextField } from '@/ui';
import { clearPrivateWorkforce, privateAccessExpires, privateAccessValid, requestWorkforceCode, verifyWorkforceCode } from '@/lib/api/workforce';

const EVENT = 'geneus:staffVerification';
const WARN_MS = 3 * 60_000;

/** The verified-session state, refreshed when it changes anywhere and as the clock runs down. */
export const useStaffVerification = () => {
  const context = useAuthorizationContext();
  const [, tick] = useState(0);
  useEffect(() => {
    const refresh = () => tick((n) => n + 1);
    window.addEventListener(EVENT, refresh);
    const timer = window.setInterval(refresh, 15_000);
    return () => { window.removeEventListener(EVENT, refresh); window.clearInterval(timer); };
  }, []);
  const expiresOn = privateAccessExpires(context);
  return { verified: privateAccessValid(context), expiresOn, remainingMs: expiresOn ? Date.parse(expiresOn) - Date.now() : 0 };
};

/**
 * Online insurance and refund actions need a server-verified identity: a code
 * emailed to the staff member's verified address. One code covers every action
 * for 15 minutes. The bar shows when it ends, warns three minutes before, and
 * renews in place, so work in progress is never lost to an expiry.
 */
export const StaffVerification = ({ children, purpose }: { children?: ReactNode; purpose: string }) => {
  const context = useAuthorizationContext();
  const { verified, expiresOn, remainingMs } = useStaffVerification();
  const [sent, setSent] = useState(''); const [code, setCode] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [renewing, setRenewing] = useState(false);
  useEffect(() => { if (!verified) setRenewing(false); }, [verified]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Verification could not complete'); } finally { setBusy(false); }
  };
  const form = <div className="space-y-3">
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <Button variant="outlined" fullWidth={false} disabled={busy} onClick={() => void run(async () => setSent((await requestWorkforceCode(context)).sentTo))}>{sent ? 'Send a new code' : 'Email me a verification code'}</Button>
    {sent ? <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { await verifyWorkforceCode(context, code); setCode(''); setSent(''); setRenewing(false); }); }}>
      <p className="text-xs text-ink-muted">Sent to {sent}. The code works once, for 15 minutes.</p>
      <TextField label="Six-digit code" name="staff-verification-code" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} onChange={(e) => setCode(e.target.value)} />
      <Button type="submit" fullWidth={false} disabled={busy || !/^\d{6}$/.test(code)} loading={busy}>Verify</Button>
    </form> : null}
  </div>;

  if (!verified) return <section aria-label="Staff verification" className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
    <h2 className="font-bold">Verify it is you</h2>
    <p className="text-sm text-ink-soft">{purpose} needs a connection and a code sent to your verified email. One code covers these actions for 15 minutes.</p>
    {form}
  </section>;

  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));
  const ending = remainingMs <= WARN_MS;
  return <>
    <div role="status" aria-label="Staff verification" className={`mb-3 flex flex-wrap items-center gap-2 rounded-field border p-3 text-sm ${ending ? 'border-amber-border bg-amber-bg' : 'border-outline-soft bg-surface'}`}>
      <span className="flex-1">{ending ? `Your verification ends in ${minutes} minute${minutes === 1 ? '' : 's'}. Renew it to keep working.` : `Verified until ${new Date(expiresOn!).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.`}</span>
      <Button variant={ending ? 'primary' : 'ghost'} fullWidth={false} onClick={() => setRenewing((v) => !v)}>{renewing ? 'Close' : 'Renew'}</Button>
      <Button variant="ghost" fullWidth={false} onClick={() => clearPrivateWorkforce()}>End verification</Button>
    </div>
    {renewing ? <section aria-label="Renew verification" className="mb-3 rounded-card border border-outline-soft bg-white p-4">{form}</section> : null}
    {children}
  </>;
};
