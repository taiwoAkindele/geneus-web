import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { InsuranceSetupStatus } from '@shared';
import { reconnectSync } from '@/data/sync';
import { insuranceSetupStatus, setInsuranceSetup, VerificationRequired } from '@/lib/api/insurance';
import { useAuthorizationContext } from '@/session';
import { Button, useToast } from '@/ui';
import { StaffVerification } from './StaffVerification';

const ITEM_LABELS: Record<string, string> = {
  time_zone_recorded: 'Hospital time zone recorded',
  payers_added: 'At least one payer added',
  active_contract: 'An active contract',
  officer_with_verified_email: 'An insurance officer with a verified email',
  devices_ready: 'Every device updated and synced',
  submission_method_per_payer: 'A claim submission method for every payer',
  contract_document_verified: 'A verified contract document for every payer',
};
const NEEDED_FOR = { billing: 'Needed before billing', claims: 'Needed before claims', optional: 'Recommended' } as const;
const STATE_TEXT = {
  off: 'Insurance is off. Bills are cash only and insurance pages are hidden from staff.',
  setup: 'Setup mode. Staff can add payers, contracts, documents and patient cover. No bill changes until Geneus activates billing.',
  active: 'Insurance billing is active. Verified cover changes what patients pay.',
} as const;
const describeError = (cause: unknown) => cause instanceof VerificationRequired ? 'Your verification ended. Verify again to continue.' : cause instanceof Error ? cause.message : 'The request failed';

/**
 * Insurance settings: whether the hospital is off, in setup or billing, and
 * what is still needed. An administrator enters or leaves setup here; billing
 * is activated by Geneus once every billing item passes.
 */
export const InsuranceSettings = () => {
  useEffect(() => { document.title = 'Insurance settings · Geneus Health'; }, []);
  return <main className="mx-auto max-w-3xl space-y-6 p-4">
    <header><h1 className="text-2xl font-extrabold">Insurance settings</h1>
      <p className="text-sm text-ink-soft">Prepare insurance without changing any bill. Billing starts only after readiness checks and Geneus approval.</p></header>
    <StaffVerification purpose="Insurance settings"><SettingsBody /></StaffVerification>
  </main>;
};

export const SetupChecklist = ({ status }: { status: InsuranceSetupStatus }) =>
  <ul aria-label="Setup checklist" className="divide-y divide-outline-soft rounded-card border border-outline-soft bg-white">{status.items.map((item) =>
    <li key={item.kind} data-ok={item.ok} className="flex items-start gap-3 p-3 text-sm">
      <span aria-hidden className={item.ok ? 'text-success' : 'text-ink-soft'}>{item.ok ? '✓' : '○'}</span>
      <span className="flex-1"><strong>{ITEM_LABELS[item.kind] ?? item.kind}</strong>{item.detail ? <span className="block text-ink-soft">{item.detail}</span> : null}</span>
      <span className="text-xs text-ink-soft">{item.ok ? 'Done' : NEEDED_FOR[item.requiredFor]}</span>
    </li>)}</ul>;

const SettingsBody = () => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [status, setStatus] = useState<InsuranceSetupStatus>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setStatus(await insuranceSetupStatus(context)); setError(''); } catch (cause) { setError(describeError(cause)); } }, [context]);
  useEffect(() => { void load(); }, [load]);
  const canSwitch = context.permissions.includes('insurance_contract:activate');
  const change = async (to: 'off' | 'setup') => {
    setBusy(true); setError('');
    try {
      await setInsuranceSetup(context, to);
      // A fresh sync token grants or withdraws insurance records on this device now, not at the next refresh.
      await reconnectSync().catch(() => undefined);
      toast(to === 'setup' ? 'Insurance setup started. No bill changes until billing is activated.' : 'Insurance turned off.');
      await load();
    } catch (cause) { setError(describeError(cause)); } finally { setBusy(false); }
  };
  if (!status) return error ? <p role="alert" className="text-sm text-danger">{error}</p> : <p role="status">Loading…</p>;
  const billingMissing = status.items.filter((i) => i.requiredFor === 'billing' && !i.ok);
  return <div className="space-y-5">
    {error ? <p role="alert" className="rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
    <section aria-label="Insurance state" className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
      <p className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Status</p>
      <p data-testid="insurance-state" className="text-lg font-bold">{status.state === 'off' ? 'Off' : status.state === 'setup' ? 'Setup' : 'Billing active'}</p>
      <p className="text-sm">{STATE_TEXT[status.state]}</p>
      {canSwitch && status.state === 'off' ? <Button fullWidth={false} loading={busy} onClick={() => void change('setup')}>Start insurance setup</Button> : null}
      {canSwitch && status.state === 'setup' ? <Button variant="outlined" fullWidth={false} loading={busy} onClick={() => void change('off')}>Leave setup</Button> : null}
      {status.state === 'setup' ? <p className="text-sm text-ink-soft">{billingMissing.length ? `${billingMissing.length} item${billingMissing.length === 1 ? '' : 's'} still needed before billing can be activated.` : 'Ready for billing. Contact Geneus to approve activation.'}</p> : null}
      {status.state === 'active' ? <p className="text-sm text-ink-soft">Only Geneus can turn billing off, and confirmed insurance splits always remain.</p> : null}
    </section>
    {status.state !== 'off' ? <section aria-label="Readiness" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Readiness</h2><Link className="text-sm font-semibold text-brand" to="/insurance/contracts">Payers &amp; contracts →</Link></div>
      <SetupChecklist status={status} />
    </section> : null}
  </div>;
};
