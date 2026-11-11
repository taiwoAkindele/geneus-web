import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from '@/data';
import { createBillingDepartment, listBillingDepartments } from '@/data/repos/billing';
import { useAuthorizationContext } from '@/session';
import { AppBar, Button, SelectField, TextField } from '@/ui';
import { billingRequest, type BillingConnection } from '@/lib/api/billing';

type ProviderAccount = { providerAccountId: string; accountNumber: string; accountName: string; bankName: string };
export const BillingSettings = () => {
  const navigate = useNavigate(); const context = useAuthorizationContext(); const departments = useLiveQuery(listBillingDepartments);
  const [connection, setConnection] = useState<BillingConnection>(); const [secret, setSecret] = useState('');
  const [readingConnection, setReadingConnection] = useState(true), [connectionError, setConnectionError] = useState('');
  const [name, setName] = useState(''); const [departmentId, setDepartment] = useState('');
  const [accounts, setAccounts] = useState<ProviderAccount[]>([]); const [providerId, setProviderId] = useState('');
  const [terminalCode, setTerminalCode] = useState(''); const [notificationPhone, setNotificationPhone] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const working = useRef(false); const allowed = context.permissions.includes('fee_item:manage');
  const refresh = async () => {
    setReadingConnection(true); setConnectionError('');
    try { setConnection(await billingRequest<BillingConnection>('connection/status', { actorStaffId: context.userId })); }
    catch (cause) { setConnectionError(cause instanceof Error ? cause.message : 'Could not read provider settings'); throw cause; }
    finally { setReadingConnection(false); }
  };
  useEffect(() => { document.title = 'Departments & accounts · Geneus Health'; if (allowed) void refresh().catch(() => {}); }, [allowed, context.userId]);
  const perform = async (action: () => Promise<void>) => {
    if (working.current) return; working.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : 'Could not save. Try again.'); }
    finally { working.current = false; setBusy(false); }
  };
  return <div className="min-h-screen bg-surface"><AppBar title="Departments & accounts" onBack={() => navigate('/billing')} /><main className="mx-auto max-w-3xl space-y-5 px-5 pb-24 pt-4">
    {!allowed ? <p>Your account cannot configure billing.</p> : <>
      <section className="space-y-3 rounded-card border border-outline-soft bg-white p-4"><h1 className="text-xl font-bold">Billing departments</h1><p className="text-sm text-ink-muted">Add Pharmacy, Oncology, Dental, GS and any other department. Assign fees and receiving accounts to the department that collects them.</p>
        {departments.loading ? <p role="status">Reading departments…</p> : departments.error ? <p role="alert">Could not read departments. <button onClick={departments.reload}>Try again</button></p> : <ul className="space-y-2">{departments.data?.map((d) => <li key={d.id} className="rounded-field bg-surface p-2 text-sm">{d.name}</li>)}</ul>}
        <TextField label="Department name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pharmacy" />
        <Button disabled={busy || !name.trim() || departments.loading || Boolean(departments.error)} onClick={() => void perform(async () => {
          if (departments.data?.some((d) => d.name.toLowerCase() === name.trim().toLowerCase())) throw new Error('This department already exists');
          await createBillingDepartment(name, context); setName(''); departments.reload(); setNotice('Department saved on this device. Let it sync before linking a receiving account.');
        })}>Add department</Button>
      </section>
      <section className="space-y-3 rounded-card border border-outline-soft bg-white p-4"><h2 className="text-lg font-bold">Hospital Paystack connection</h2><p className="text-sm text-ink-muted">Each hospital connects its own Paystack business account. Account numbers are linked to departments; patients transfer from their banking apps.</p>
        <p className="text-sm">{readingConnection ? 'Reading connection…' : connectionError ? 'Connection unavailable' : connection?.configured ? `Connected · ${connection.mode} mode` : 'Not connected'}</p>
        {connectionError ? <div role="alert" className="rounded-field bg-danger-bg p-3 text-sm text-danger"><p>{connectionError}</p><Button fullWidth={false} variant="ghost" disabled={readingConnection} onClick={() => void refresh().catch(() => {})}>Retry connection</Button></div> : null}
        {connection && !connection.encryptionReady ? <p className="rounded-field bg-amber-bg p-3 text-sm">Payment setup needs secure server configuration before credentials can be saved. Ask your server administrator to enable encrypted provider credentials.</p> : null}
        <TextField label="Paystack secret key" type="password" autoComplete="new-password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Use a test key first" />
        <p className="text-xs text-ink-muted">Sent securely to the backend and stored encrypted. It is never saved in this device's database or returned to the screen.</p>
        <Button disabled={busy || !secret || !connection?.encryptionReady} onClick={() => void perform(async () => {
          try { await billingRequest('connection', { actorStaffId: context.userId, secretKey: secret }); await refresh(); setAccounts([]); setNotice('Paystack connection saved.'); }
          finally { setSecret(''); }
        })}>Connect Paystack</Button>
        {connection?.webhookPath ? <div><p className="text-sm font-semibold">Webhook setup</p><p className="text-xs text-ink-muted">In Paystack's dashboard, enter your public Geneus backend URL followed by:</p><p className="mt-1 break-all rounded-field bg-surface p-3 font-mono text-xs">{connection.webhookPath}</p></div> : null}
      </section>
      <section className="space-y-3 rounded-card border border-outline-soft bg-white p-4"><h2 className="text-lg font-bold">Department receiving accounts</h2>
        <p className="text-sm text-ink-muted">Each department can have its own receiving account. Create a Paystack payment point here, or link an existing virtual terminal or dedicated account. A normal bank settlement account is not an incoming-transfer feed.</p>
        <SelectField label="Receiving department" value={departmentId} options={[{ value: '', label: 'Hospital / general' }, ...(departments.data ?? []).filter((d) => d.active).map((d) => ({ value: d.id, label: d.name }))]} onChange={(e) => setDepartment(e.target.value)} />
        <TextField label="Department WhatsApp notification number" value={notificationPhone} onChange={(e) => setNotificationPhone(e.target.value)} placeholder="e.g. +2348012345678" inputMode="tel" />
        <Button disabled={busy || !connection?.configured || !departmentId || !notificationPhone} onClick={() => void perform(async () => {
          await billingRequest('accounts/create-terminal', { actorStaffId: context.userId, departmentId, notificationPhone }); await refresh(); setNotice('Department payment point created and its bank account linked.');
        })}>Create department payment point</Button>
        <Button variant="outlined" disabled={busy || !connection?.configured} onClick={() => void perform(async () => {
          const found = await billingRequest<ProviderAccount[]>('accounts/discover', { actorStaffId: context.userId }); setAccounts(found); setNotice(found.length ? 'Choose an account and its receiving department.' : 'No active NGN receiving accounts found in this connection.');
        })}>Find Paystack receiving accounts</Button>
        {accounts.length ? <SelectField label="Existing dedicated receiving account" value={providerId} options={[{ value: '', label: 'Choose account' }, ...accounts.map((a) => ({ value: a.providerAccountId, label: `${a.bankName} · ${a.accountNumber} · ${a.accountName}` }))]} onChange={(e) => setProviderId(e.target.value)} /> : null}
        <TextField label="Or enter an existing Paystack terminal code" value={terminalCode} onChange={(e) => setTerminalCode(e.target.value)} placeholder="VT_…" />
        <Button variant="outlined" disabled={busy || !connection?.configured || (!providerId && !terminalCode.trim())} onClick={() => void perform(async () => {
          await billingRequest('accounts/link', { actorStaffId: context.userId, providerAccountId: terminalCode.trim() || providerId, departmentId: departmentId || undefined }); await refresh(); setProviderId(''); setTerminalCode(''); setNotice('Receiving account linked. Incoming transfers will identify its department.');
        })}>Link existing account to department</Button>
        <div className="space-y-2">{connection?.accounts.map((a) => <article className="rounded-field border border-outline-soft p-3" key={a.id}><h3 className="font-semibold">{departments.data?.find((d) => d.id === a.departmentId)?.name ?? 'Hospital / general'} · {a.mode}</h3><p className="text-sm">{a.bankName} · {a.accountName}</p><p className="font-mono">{a.accountNumber}</p></article>)}</div>
      </section>
      {error ? <div role="alert" className="rounded-card bg-danger-bg p-3 text-sm text-danger">{error}<Button variant="ghost" onClick={() => void perform(refresh)}>Retry connection</Button></div> : null}
      {notice ? <p role="status" className="rounded-card bg-brand-wash p-3 text-sm text-brand">{notice}</p> : null}
    </>}
  </main></div>;
};
