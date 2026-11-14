import { useCallback, useEffect, useState } from 'react';
import type { OwnEmailStatus } from '@shared';
import { confirmOwnEmail, ownEmailStatus, requestOwnEmailCode } from '@/lib/api/selfService';
import { useStaffVerification } from '@/modules/insurance/StaffVerification';
import { useAuthorizationContext, useSession } from '@/session';
import { Button, TextField, useToast } from '@/ui';

const digits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

/**
 * The signed-in person's own profile. Their email address protects online
 * work — insurance, claims, private staff records — with a code sent to it.
 * Proving an address takes a code to it; a first address (or one replacing
 * an address you can no longer reach) is then confirmed by an administrator,
 * because this device alone cannot prove who is holding it.
 */
export const MyProfileScreen = () => {
  const { user } = useSession();
  useEffect(() => { document.title = 'My profile · Geneus Health'; }, []);
  return <main className="mx-auto max-w-2xl space-y-5 p-4">
    <header><h1 className="text-2xl font-extrabold">My profile</h1><p className="text-sm text-ink-soft">{user.name} · {user.role}</p></header>
    <MyEmailCard />
  </main>;
};

export const MyEmailCard = () => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const { verified: sessionVerified } = useStaffVerification();
  const [status, setStatus] = useState<OwnEmailStatus>(); const [email, setEmail] = useState(''); const [sentTo, setSentTo] = useState(''); const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const load = useCallback(() => ownEmailStatus(context).then(setStatus, (cause) => setError(cause instanceof Error ? cause.message : 'Could not load')), [context]);
  useEffect(() => { void load(); }, [load, sessionVerified]);
  const run = async (step: () => Promise<void>) => { setBusy(true); setError(''); try { await step(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'The request failed'); } finally { setBusy(false); } };
  return <section aria-label="My email" className="space-y-3 rounded-card border border-outline-soft bg-white p-5">
    <h2 className="text-lg font-bold">My email address</h2>
    <p className="text-sm text-ink-muted">Online work such as insurance and claims asks for a code sent to this address, so it must be one only you can read.</p>
    {status ? <p data-testid="my-email-status" className="text-sm">{status.verified ? <>Verified: <strong>{status.email}</strong></> : 'No verified email yet.'}
      {status.pending ? <span className="mt-1 block text-amber-text">{status.pending.email} is proven and waiting for an administrator to confirm it is yours.</span> : null}</p> : <p role="status" className="text-sm">Loading…</p>}
    {status?.verified && !sessionVerified ? <p className="text-sm text-ink-soft">To change it immediately, first verify with your current address (any insurance screen offers this). Otherwise an administrator confirms the new one.</p> : null}
    {!sentTo ? <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await requestOwnEmailCode(context, email.trim()); setSentTo(r.sentTo); }); }}>
      <TextField label={status?.verified ? 'New email address' : 'Email address'} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button type="submit" fullWidth={false} loading={busy} disabled={!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())}>Email me a code</Button>
    </form> : <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void run(async () => {
      const r = await confirmOwnEmail(context, email.trim(), code);
      toast(r.status === 'verified' ? 'Your email is verified.' : 'Address proven. An administrator will confirm it is yours.');
      setSentTo(''); setCode(''); setEmail(''); await load();
    }); }}>
      <p className="text-sm">We sent a 6-digit code to {sentTo}.</p>
      <TextField label="Code from the email" inputMode="numeric" value={code} onChange={(e) => setCode(digits(e.target.value))} />
      <div className="flex gap-2"><Button type="submit" fullWidth={false} loading={busy} disabled={code.length !== 6}>Confirm</Button><Button type="button" variant="ghost" fullWidth={false} onClick={() => { setSentTo(''); setCode(''); }}>Use another address</Button></div>
    </form>}
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
  </section>;
};
