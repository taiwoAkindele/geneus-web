import { useEffect, useState, type ReactNode } from 'react';
import { useAuthorizationContext } from '@/session';
import { Button, TextField } from '@/ui';
import { privateAccessValid, privateAccessExpires, requestWorkforceCode, verifyWorkforceCode, clearPrivateWorkforce } from '@/lib/api/workforce';
export const PrivateAccess = ({ children }: {
  children: ReactNode;
}) => {
  const context = useAuthorizationContext(), [ready, setReady] = useState(() => privateAccessValid(context)), [code, setCode] = useState(''), [sent, setSent] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!ready)
      return; const timer = setTimeout(() => { clearPrivateWorkforce(); setReady(false); setSent(''); }, Math.max(0, Date.parse(privateAccessExpires(context) || '') - Date.now())); return () => clearTimeout(timer);
  }, [ready, context.userId]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(''); try {
      await action();
    }
      catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Verification could not complete');
      }
      finally {
      setBusy(false);
    }
  };
  if (ready)
    return <>{children}</>;
  return <section className="space-y-3 rounded-field border border-outline-soft bg-white p-4"><p className="text-sm text-ink-muted">Verify your established staff contact for this private online action.</p>{error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}<Button variant="outlined" disabled={busy} onClick={() => void run(async () => setSent((await requestWorkforceCode(context)).sentTo))}>Send staff verification code</Button>{sent ? <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { await verifyWorkforceCode(context, code); setReady(true); setCode(''); }); }}><p className="text-xs">Sent to {sent} · expires in 15 minutes.</p><TextField label="Six-digit code" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={6} onChange={(e) => setCode(e.target.value)} /><Button type="submit" disabled={busy || !/^\d{6}$/.test(code)} loading={busy}>Verify staff contact</Button></form> : null}</section>;
};
