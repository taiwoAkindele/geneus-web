import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { InsuranceSetupStatus } from '@shared';
import { reconnectSync } from '@/data/sync';
import { insuranceSetupStatus, requestInsuranceActivation, setInsuranceSetup, VerificationRequired, withdrawInsuranceActivation } from '@/lib/api/insurance';
import { useAuthorizationContext } from '@/session';
import { Button, TextAreaField, useToast } from '@/ui';
import { StaffVerification } from './StaffVerification';
import { guideFor, NEEDED_FOR } from './setupGuide';
import { DiagnosisCatalogue } from './DiagnosisCatalogue';

const STATE_TEXT = {
  off: 'Insurance is off. Bills are cash only and insurance pages are hidden from staff.',
  setup: 'Setup mode. Staff can add payers, contracts, documents and patient cover. No bill changes until Geneus approves billing.',
  active: 'Insurance billing is active. Verified cover changes what patients pay for services from activation onwards.',
} as const;
const describeError = (cause: unknown) => cause instanceof VerificationRequired ? 'Your session with the server ended. Confirm your PIN to continue.' : cause instanceof Error ? cause.message : 'The request failed';

/**
 * Insurance settings: whether the hospital is off, in setup or billing, what
 * is still needed and where to do it, and the request to Geneus to switch
 * billing on. Geneus approves in its operator console; the server re-checks
 * every requirement when it does.
 */
export const InsuranceSettings = () => {
  useEffect(() => { document.title = 'Insurance settings · Geneus Health'; }, []);
  return <main className="mx-auto max-w-3xl space-y-6 p-4">
    <header><h1 className="text-2xl font-extrabold">Insurance settings</h1>
      <p className="text-sm text-ink-soft">Prepare insurance without changing any bill. Billing starts only when every requirement is met and Geneus approves it.</p></header>
    <StaffVerification purpose="Insurance settings"><SettingsBody /></StaffVerification>
  </main>;
};

export const SetupChecklist = ({ status }: { status: InsuranceSetupStatus }) => {
  const context = useAuthorizationContext();
  return <ul aria-label="Setup checklist" className="space-y-3">{status.items.map((item) => {
    const guide = guideFor(item, context);
    return <li key={item.kind} data-kind={item.kind} data-ok={item.ok} className={`rounded-card border bg-white p-4 text-sm ${item.ok ? 'border-outline-soft' : item.requiredFor === 'optional' ? 'border-outline-soft' : 'border-amber-border'}`}>
      <div className="flex items-start gap-3">
        <span aria-hidden className={`mt-0.5 font-bold ${item.ok ? 'text-success' : 'text-amber-text'}`}>{item.ok ? '✓' : '!'}</span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-baseline justify-between gap-2"><strong className="text-base">{guide.title}</strong><span className="text-xs text-ink-soft">{item.ok ? 'Done' : NEEDED_FOR[item.requiredFor]}</span></div>
          <p>{guide.status}</p>
          {!item.ok ? <p className="text-ink-soft"><span className="font-semibold">Why it matters:</span> {guide.why}</p> : null}
          {!item.ok ? <p className="text-ink-soft"><span className="font-semibold">Who resolves it:</span> {guide.who}</p> : null}
          {guide.steps.length ? <ul className="mt-2 space-y-2">{guide.steps.map((s, i) => <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-field bg-surface-muted p-2">
            <span className="min-w-0 flex-1">{s.text}</span>{s.action ? <Link className="min-h-[40px] content-center font-semibold text-brand underline" to={s.action.to}>{s.action.label}</Link> : null}</li>)}</ul> : null}
          {guide.action && (!item.ok || item.kind === 'time_zone_recorded') ? <Link className="inline-block min-h-[40px] content-center font-semibold text-brand underline" to={guide.action.to}>{guide.action.label}</Link> : null}
        </div>
      </div>
    </li>;
  })}</ul>;
};

const SettingsBody = () => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [status, setStatus] = useState<InsuranceSetupStatus>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [note, setNote] = useState('');
  const load = useCallback(async () => { try { setStatus(await insuranceSetupStatus(context)); setError(''); } catch (cause) { setError(describeError(cause)); } }, [context]);
  useEffect(() => { void load(); }, [load]);
  const canSwitch = context.permissions.includes('insurance_contract:activate');
  const act = async (work: () => Promise<unknown>, done: string, resync = false) => {
    setBusy(true); setError('');
    try { await work(); if (resync) await reconnectSync().catch(() => undefined); toast(done); await load(); } catch (cause) { setError(describeError(cause)); } finally { setBusy(false); }
  };
  if (!status) return error ? <p role="alert" className="text-sm text-danger">{error}</p> : <p role="status">Loading…</p>;
  const blocking = status.items.filter((i) => i.requiredFor === 'billing' && !i.ok);
  const request = status.activation;
  return <div className="space-y-5">
    {error ? <p role="alert" className="rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
    <section aria-label="Insurance state" className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Status</p>
      <p data-testid="insurance-state" className="text-lg font-bold">{status.state === 'off' ? 'Off' : status.state === 'setup' ? 'Setup' : 'Billing active'}</p>
      <p className="text-sm">{STATE_TEXT[status.state]}</p>
      {canSwitch && status.state === 'off' ? <Button fullWidth={false} loading={busy} onClick={() => void act(() => setInsuranceSetup(context, 'setup'), 'Insurance setup started. No bill changes until billing is approved.', true)}>Start insurance setup</Button> : null}
      {canSwitch && status.state === 'setup' ? <Button variant="outlined" fullWidth={false} loading={busy} onClick={() => void act(() => setInsuranceSetup(context, 'off'), 'Insurance turned off.', true)}>Leave setup</Button> : null}
      {status.state === 'active' ? <p className="text-sm text-ink-soft">Only Geneus can turn billing off, and confirmed insurance splits always remain.</p> : null}
    </section>

    {status.state === 'setup' || request ? <section aria-label="Billing activation" className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
      <h2 className="text-lg font-bold">Insurance billing activation</h2>
      {request?.status === 'requested' ? <>
        <p data-testid="activation-status" className="text-sm"><strong>Waiting for Geneus.</strong> Requested {new Date(request.requestedOn).toLocaleString('en-GB')}{request.requestedByName ? ` by ${request.requestedByName}` : ''}. Geneus checks every requirement again before switching billing on.</p>
        {canSwitch ? <Button variant="ghost" fullWidth={false} loading={busy} onClick={() => void act(() => withdrawInsuranceActivation(context), 'Activation request withdrawn.')}>Withdraw request</Button> : null}
      </> : request?.status === 'approved' ? <p data-testid="activation-status" className="text-sm text-success"><strong>Approved by Geneus</strong> {request.decidedOn ? new Date(request.decidedOn).toLocaleString('en-GB') : ''}{request.decisionNote ? ` · ${request.decisionNote}` : ''}</p>
        : request?.status === 'rejected' ? <p data-testid="activation-status" className="text-sm text-danger"><strong>Not approved:</strong> {request.decisionNote}. Resolve it and request again.</p> : null}
      {status.state === 'setup' && request?.status !== 'requested' ? (blocking.length
        ? <p className="text-sm text-ink-soft">{blocking.length} requirement{blocking.length === 1 ? '' : 's'} below must be completed before you can request activation.</p>
        : canSwitch ? <div className="space-y-2"><p className="text-sm">Every requirement is met. Ask Geneus to switch insurance billing on.</p>
          <TextAreaField label="Note for Geneus (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button fullWidth={false} loading={busy} onClick={() => void act(() => requestInsuranceActivation(context, note), 'Activation requested. Geneus will review it.')}>Request billing activation</Button></div>
          : <p className="text-sm">Every requirement is met. A facility administrator can now request activation.</p>) : null}
    </section> : null}

    {status.state !== 'off' ? <section aria-label="Readiness" className="space-y-2">
      <h2 className="text-lg font-bold">Readiness</h2>
      <SetupChecklist status={status} />
    </section> : null}
    {status.state !== 'off' && context.permissions.includes('insurance_contract:read') ? <DiagnosisCatalogue /> : null}
  </div>;
};
