import { useCallback, useEffect, useState } from 'react';
import type { InsuranceActivationRequest, InsuranceSetupStatus, OperatorFacility } from '@shared';
import {
  OPERATOR_SESSION_EVENT, addOperator, decideActivationRequest, listOperators, operatorEvents, operatorFacilities, operatorFacilityInsurance, operatorSession, operatorSignIn, operatorSignOut,
  removeOperator, requestOperatorCode, setFacilityInsuranceState, type OperatorEvent, type PlatformOperator,
} from '@/lib/api/operator';
import { Button, TextAreaField, TextField } from '@/ui';
import { guideFor, NEEDED_FOR } from '@/modules/insurance/setupGuide';

const message = (cause: unknown) => cause instanceof Error ? cause.message : 'The request failed';
const STATE = { off: 'Off', setup: 'Setup', active: 'Billing active' } as const;

/**
 * The Geneus operator console: platform decisions made in an interface, not
 * by scripts. Today it approves insurance billing activation during the
 * controlled rollout, changes a hospital's insurance state, and manages who
 * is an operator. Every decision is recorded with the operator's name.
 */
export const OperatorConsole = () => {
  const [, refresh] = useState(0);
  useEffect(() => { document.title = 'Geneus operator console'; const on = () => refresh((n) => n + 1); window.addEventListener(OPERATOR_SESSION_EVENT, on); return () => window.removeEventListener(OPERATOR_SESSION_EVENT, on); }, []);
  const session = operatorSession();
  return <div className="min-h-screen bg-surface">
    <header className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-soft bg-white px-4 py-3">
      <div><p className="text-lg font-extrabold">Geneus operator console</p><p className="text-xs text-ink-soft">For Geneus staff. Hospitals manage their own settings in the app.</p></div>
      {session ? <div className="flex items-center gap-3 text-sm"><span>{session.operator.name} · {session.operator.email}</span><Button variant="ghost" fullWidth={false} onClick={() => void operatorSignOut()}>Sign out</Button></div> : null}
    </header>
    <main className="mx-auto max-w-5xl space-y-6 p-4">{session ? <Console /> : <SignIn />}</main>
  </div>;
};

const SignIn = () => {
  const [email, setEmail] = useState(''); const [code, setCode] = useState(''); const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const run = async (step: () => Promise<unknown>) => { setBusy(true); setError(''); try { await step(); } catch (cause) { setError(message(cause)); } finally { setBusy(false); } };
  return <section aria-label="Operator sign-in" className="mx-auto max-w-md space-y-3 rounded-card border border-outline-soft bg-white p-5">
    <h1 className="text-xl font-bold">Sign in</h1>
    {!sent ? <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(async () => { await requestOperatorCode(email.trim()); setSent(true); }); }}>
      <TextField label="Operator email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <Button type="submit" loading={busy} disabled={!email.includes('@')}>Email me a code</Button>
      <p className="text-xs text-ink-soft">If this address belongs to a Geneus operator, a code arrives within a minute.</p>
    </form> : <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run(() => operatorSignIn(email.trim(), code)); }}>
      <TextField label="Six-digit code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} />
      <Button type="submit" loading={busy} disabled={code.length !== 6}>Sign in</Button>
      <Button type="button" variant="ghost" onClick={() => { setSent(false); setCode(''); }}>Use another address</Button>
    </form>}
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
  </section>;
};

const Console = () => {
  const [tab, setTab] = useState<'facilities' | 'operators' | 'history'>('facilities');
  return <>
    <div role="tablist" className="flex flex-wrap gap-2">{([['facilities', 'Hospitals & activation'], ['operators', 'Operators'], ['history', 'Decision history']] as const).map(([key, label]) =>
      <Button key={key} role="tab" aria-selected={tab === key} variant={tab === key ? 'secondary' : 'ghost'} fullWidth={false} onClick={() => setTab(key)}>{label}</Button>)}</div>
    {tab === 'facilities' ? <Facilities /> : tab === 'operators' ? <Operators /> : <History />}
  </>;
};

const Facilities = () => {
  const [facilities, setFacilities] = useState<OperatorFacility[]>(); const [open, setOpen] = useState(''); const [error, setError] = useState('');
  const load = useCallback(() => operatorFacilities().then((r) => { setFacilities(r.facilities); setError(''); }, (cause) => setError(message(cause))), []);
  useEffect(() => { void load(); }, [load]);
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  if (!facilities) return <p role="status">Loading…</p>;
  const waiting = facilities.filter((f) => f.openRequest).length;
  return <section aria-label="Hospitals" className="space-y-3">
    <p className="text-sm"><strong>{waiting}</strong> activation request{waiting === 1 ? '' : 's'} waiting.</p>
    <ul className="space-y-2">{facilities.map((f) => <li key={f.id} data-facility={f.code} className="rounded-card border border-outline-soft bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span><strong>{f.name}</strong> · {f.code} · Insurance: {STATE[f.insuranceState]}{f.openRequest ? <span className="ml-2 rounded-full bg-amber-bg px-2 py-0.5 text-amber-text">Activation requested {new Date(f.openRequest.requestedOn).toLocaleDateString('en-GB')}</span> : null}</span>
        <Button variant="ghost" fullWidth={false} onClick={() => setOpen(open === f.id ? '' : f.id)}>{open === f.id ? 'Close' : 'Review'}</Button>
      </div>
      {open === f.id ? <FacilityReview facility={f} onChanged={load} /> : null}
    </li>)}</ul>
  </section>;
};

const FacilityReview = ({ facility, onChanged }: { facility: OperatorFacility; onChanged: () => void }) => {
  const [status, setStatus] = useState<InsuranceSetupStatus>(); const [requests, setRequests] = useState<InsuranceActivationRequest[]>([]);
  const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [done, setDone] = useState('');
  const load = useCallback(() => operatorFacilityInsurance(facility.id).then((r) => { setStatus(r.status); setRequests(r.requests); }, (cause) => setError(message(cause))), [facility.id]);
  useEffect(() => { void load(); }, [load]);
  const act = async (work: () => Promise<unknown>, text: string) => { setBusy(true); setError(''); setDone(''); try { await work(); setDone(text); setNote(''); await load(); onChanged(); } catch (cause) { setError(message(cause)); } finally { setBusy(false); } };
  if (!status) return <p role="status" className="mt-2 text-sm">Loading…</p>;
  const open = requests.find((r) => r.status === 'requested');
  const blocking = status.items.filter((i) => i.requiredFor === 'billing' && !i.ok);
  return <div className="mt-3 space-y-3 border-t border-outline-soft pt-3 text-sm">
    <p>Time zone: <strong>{status.timeZone ?? 'not configured'}</strong> · {blocking.length ? `${blocking.length} billing requirement${blocking.length === 1 ? '' : 's'} not met` : 'Every billing requirement is met'}</p>
    <ul aria-label={`Readiness of ${facility.name}`} className="space-y-1">{status.items.map((item) => { const g = guideFor(item, { userId: '', permissions: [] }); return <li key={item.kind} className={item.ok ? '' : item.requiredFor === 'billing' ? 'text-danger' : 'text-amber-text'}>
      {item.ok ? '✓' : '!'} <strong>{g.title}</strong>: {g.status} <span className="text-xs text-ink-soft">({item.ok ? 'done' : NEEDED_FOR[item.requiredFor]})</span>
      {!item.ok && g.steps.length ? <ul className="ml-5 list-disc text-ink-soft">{g.steps.map((s, i) => <li key={i}>{s.text}</li>)}</ul> : null}</li>; })}</ul>
    {open ? <div className="space-y-2 rounded-field border border-amber-border bg-amber-bg p-3">
      <p><strong>Activation requested</strong> {new Date(open.requestedOn).toLocaleString('en-GB')}{open.requestedByName ? ` by ${open.requestedByName}` : ''}{open.note ? ` · “${open.note}”` : ''}</p>
      <TextAreaField label="Decision note (approval reference or reason)" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        <Button fullWidth={false} loading={busy} disabled={note.trim().length < 3 || blocking.length > 0} onClick={() => void act(() => decideActivationRequest(open.id, 'approve', note.trim()), 'Approved: insurance billing is active.')}>Approve and activate billing</Button>
        <Button fullWidth={false} variant="outlined" loading={busy} disabled={note.trim().length < 3} onClick={() => void act(() => decideActivationRequest(open.id, 'reject', note.trim()), 'Rejected. The hospital sees your reason.')}>Reject</Button>
      </div>
      {blocking.length ? <p className="text-danger">Approval is not possible until every billing requirement is met; the server re-checks them when you approve.</p> : null}
    </div> : null}
    {status.state === 'active' ? <div className="space-y-2 rounded-field border border-outline-soft p-3">
      <p>Turning billing off keeps every confirmed split and the insurance treatment of charges raised while it was on.</p>
      <TextAreaField label="Reason for turning billing off" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button fullWidth={false} variant="danger-outline" loading={busy} disabled={note.trim().length < 5} onClick={() => void act(() => setFacilityInsuranceState(facility.id, 'setup', note.trim()), 'Billing turned off; the hospital is back in setup.')}>Turn billing off</Button>
    </div> : null}
    {done ? <p role="status" className="text-success">{done}</p> : null}
    {error ? <p role="alert" className="text-danger">{error}</p> : null}
    {requests.length ? <details><summary className="cursor-pointer font-semibold">Request history</summary><ul className="mt-1 space-y-1">{requests.map((r) => <li key={r.id}>{new Date(r.requestedOn).toLocaleString('en-GB')} · {r.status}{r.decisionNote ? ` · ${r.decisionNote}` : ''}</li>)}</ul></details> : null}
  </div>;
};

const Operators = () => {
  const [operators, setOperators] = useState<PlatformOperator[]>(); const [email, setEmail] = useState(''); const [name, setName] = useState(''); const [error, setError] = useState('');
  const me = operatorSession()?.operator.id;
  const load = useCallback(() => listOperators().then((r) => { setOperators(r.operators); setError(''); }, (cause) => setError(message(cause))), []);
  useEffect(() => { void load(); }, [load]);
  return <section aria-label="Operators" className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
    <h2 className="text-lg font-bold">Operators</h2>
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <ul className="space-y-1 text-sm">{(operators ?? []).filter((o) => o.active).map((o) => <li key={o.id} className="flex flex-wrap items-center justify-between gap-2"><span>{o.name} · {o.email}</span>
      {o.id !== me ? <Button variant="ghost" fullWidth={false} onClick={() => removeOperator(o.id).then(load, (cause) => setError(message(cause)))}>Remove</Button> : <span className="text-xs text-ink-soft">You</span>}</li>)}</ul>
    <form className="grid gap-2 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); addOperator(email.trim(), name.trim()).then(() => { setEmail(''); setName(''); void load(); }, (cause) => setError(message(cause))); }}>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} /><TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <div className="flex items-end"><Button type="submit" disabled={!name.trim() || !email.includes('@')}>Add operator</Button></div>
    </form>
  </section>;
};

const History = () => {
  const [events, setEvents] = useState<OperatorEvent[]>(); const [error, setError] = useState('');
  useEffect(() => { operatorEvents().then((r) => setEvents(r.events), (cause) => setError(message(cause))); }, []);
  if (error) return <p role="alert" className="text-sm text-danger">{error}</p>;
  return <ul aria-label="Decision history" className="space-y-1 rounded-card border border-outline-soft bg-white p-4 text-sm">{(events ?? []).map((e, i) =>
    <li key={i}>{new Date(e.at).toLocaleString('en-GB')} · {e.email} · {e.action.replace(/_/g, ' ')}{e.subject ? ` · ${e.subject}` : ''}{typeof e.metadata.note === 'string' ? ` · ${e.metadata.note}` : typeof e.metadata.reason === 'string' ? ` · ${e.metadata.reason}` : ''}</li>)}</ul>;
};
