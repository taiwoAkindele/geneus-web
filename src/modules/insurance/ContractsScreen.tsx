import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Arrangement, FeeCategory, FixedCopayBasis, PayerContractTerms, PayerKind, scheduleLineFor, serviceDateOf,
  type ContractPlan, type FeeItem, type Payer, type PayerContractVersion, type PlanRule, type UnsupportedTerm,
} from '@shared';
import { useLiveQuery } from '@/data';
import { listFeeItems } from '@/data/repos/billing';
import { listPayers } from '@/data/repos/insurance';
import { allOfType } from '@/data/db';
import {
  activateContract, activationReadiness, endContract, listContractSummaries, listContracts, saveContractDraft, savePayer, VerificationRequired, type DeviceBlocker,
} from '@/lib/api/insurance';
import { ApiError } from '@/lib/api/client';
import { amountInput, parseAmount } from '@/lib/money';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, TextAreaField, TextField, useToast } from '@/ui';
import { CATEGORY_LABELS } from '@/modules/finance/billing/feeForm';
import { StaffVerification } from './StaffVerification';
import { useInsuranceSupported } from './CoverCard';
import { PayerSetup } from './PayerSetup';
import { TariffImport } from './TariffImport';
import type { Facility } from '@shared';

const ARRANGEMENT_LABELS: Record<Arrangement, string> = { per_service: 'Paid per service', capitation: 'Capitation', per_diem: 'Per day (not calculated yet)', package: 'Package (not calculated yet)' };
const BASIS_LABELS: Record<string, string> = { per_unit: 'per unit', per_charge: 'per charge (not calculated yet)', per_dispense: 'per dispense (not calculated yet)', per_visit: 'per visit (not calculated yet)', per_claim: 'per claim (not calculated yet)' };
const KIND_LABELS: Record<PayerKind, string> = { national_scheme: 'National scheme', state_scheme: 'State scheme', hmo: 'HMO', company: 'Company', other: 'Other' };
const blankPlan = (): ContractPlan => ({ planCode: '', name: '', rules: { categories: {}, items: {} } });
const describeError = (cause: unknown) => cause instanceof VerificationRequired ? 'Your session with the server ended. Confirm your PIN to continue.' : cause instanceof Error ? cause.message : 'The request failed';

/**
 * Payers and their contracts. Contract terms stay on the server: this screen
 * reads them online for staff allowed to, and devices only ever receive the
 * patient-facing schedule built when a version is activated.
 */
export const ContractsScreen = () => {
  const context = useAuthorizationContext();
  const supported = useInsuranceSupported();
  useEffect(() => { document.title = 'Payers & contracts · Geneus Health'; }, []);
  if (!supported) return <main className="p-4"><h1 className="text-xl font-bold">Payers &amp; contracts</h1><p className="mt-2 text-sm">Insurance is off for this hospital. An administrator can start setup in <Link className="font-semibold text-brand" to="/settings/insurance/setup">Insurance settings</Link>.</p></main>;
  const canRead = context.permissions.includes('insurance_contract:read');
  return <main className="mx-auto max-w-5xl space-y-6 p-4">
    <header><h1 className="text-2xl font-extrabold">Payers &amp; contracts</h1>
      <p className="text-sm text-ink-soft">Contract prices stay on the server. Devices receive only what the patient pays, once a version is activated.</p></header>
    <StaffVerification purpose="Managing payer contracts"><ContractsBody canRead={canRead} /></StaffVerification>
  </main>;
};

const ContractsBody = ({ canRead }: { canRead: boolean }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const local = useLiveQuery(useCallback(async () => {
    const [payers, fees, facilities] = await Promise.all([listPayers(), listFeeItems(), allOfType<Facility>('facility')]);
    return { payers, fees: fees.filter((f) => f.active), timeZone: facilities[0]?.timeZone };
  }, []), ['payer', 'fee_item', 'facility']);
  const [versions, setVersions] = useState<PayerContractVersion[]>(); const [error, setError] = useState('');
  // A readiness link can open one payer directly (?payer=…).
  const [params] = useSearchParams();
  const [payerId, setPayerId] = useState(() => params.get('payer') ?? ''); const [editingPayer, setEditingPayer] = useState<Payer | 'new'>();
  const canActivate = context.permissions.includes('insurance_contract:activate');
  const reload = useCallback(async () => {
    try {
      // Staff who only activate or end versions get them without prices.
      if (canRead) setVersions((await listContracts(context)).versions);
      else if (canActivate) setVersions((await listContractSummaries(context)).versions.map((v) => ({ ...v, facilityId: context.facilityId, revision: 1, createdBy: '', createdOn: '', terms: { payerId: v.payerId, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo } }) as unknown as PayerContractVersion));
      setError('');
    } catch (cause) { setError(describeError(cause)); }
  }, [canRead, canActivate, context]);
  useEffect(() => { void reload(); }, [reload]);
  if (!local.data) return <p role="status">Loading…</p>;
  const { payers, fees, timeZone } = local.data;
  const selected = payers.find((p) => p.id === payerId);
  const mine = (versions ?? []).filter((v) => v.terms.payerId === payerId).sort((a, b) => b.version - a.version);
  const canManage = context.permissions.includes('insurance_contract:manage');
  return <div className="space-y-6">
    {error ? <p role="alert" className="rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}
    {!timeZone ? <p role="alert" className="rounded-field border border-amber-border bg-amber-bg p-3 text-sm">The hospital's time zone is not recorded. Contracts cannot be activated until an administrator records it.</p> : null}
    <section aria-label="Payers" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-bold">Payers</h2>{canManage ? <Button variant="outlined" fullWidth={false} onClick={() => setEditingPayer('new')}>Add payer</Button> : null}</div>
      {payers.length === 0 ? <p className="text-sm">No payers yet. Add the schemes and HMOs this hospital works with.</p> : <ul className="divide-y divide-outline-soft rounded-card border border-outline-soft bg-white">{payers.map((p) => <li key={p.id} className="flex flex-wrap items-center gap-2 p-3"><span className="flex-1"><strong>{p.name}</strong> · {p.code} · {KIND_LABELS[p.kind]}{p.active ? '' : ' · inactive'}</span><Button variant="ghost" fullWidth={false} onClick={() => setPayerId(p.id)}>Contracts</Button>{canManage ? <Button variant="ghost" fullWidth={false} onClick={() => setEditingPayer(p)}>Edit</Button> : null}</li>)}</ul>}
      {editingPayer ? <PayerForm existing={editingPayer === 'new' ? undefined : editingPayer} onDone={(saved) => { setEditingPayer(undefined); if (saved) toast(`${saved.name} saved. Devices receive it with the next sync.`); }} /> : null}
    </section>
    {selected ? <section aria-label="Contract versions" className="space-y-3">
      <h2 className="text-lg font-bold">{selected.name}</h2>
      <PayerSetup key={`setup:${selected.id}`} payer={selected} />
      <h3 className="font-bold">Contract versions</h3>
      {!canRead ? <p className="text-sm">You can activate or end versions, but reading contract prices needs separate permission.</p> : null}
      {mine.length === 0 ? <p className="text-sm">No contract yet.</p> : <ul className="space-y-2">{mine.map((v) => <li key={v.id} className="rounded-field border border-outline-soft bg-white p-3 text-sm"><strong>Version {v.version}</strong> · {v.status === 'draft' ? 'Draft' : 'Active'} · from {v.terms.effectiveFrom}{v.terms.effectiveTo ? ` to ${v.terms.effectiveTo}` : ''}{v.endedOn ? ` · ends ${v.endedOn} (${v.endReason})` : ''}
        {v.status === 'active' && !v.endedOn && context.permissions.includes('insurance_contract:activate') ? <EndContract version={v} today={serviceDateOf(new Date().toISOString(), timeZone)} onDone={reload} /> : null}</li>)}</ul>}
      {canManage && canRead && versions ? <TariffImport key={`import:${payerId}`} payer={selected} fees={fees} draft={mine.find((v) => v.status === 'draft')} base={mine.find((v) => v.status === 'active')} onImported={reload} /> : null}
      {canManage && canRead && versions ? <ContractEditor key={`${payerId}:${mine.find((v) => v.status === 'draft')?.revision ?? 0}`} payer={selected} fees={fees} draft={mine.find((v) => v.status === 'draft')} base={mine.find((v) => v.status === 'active')} onSaved={reload} /> : null}
      {mine.some((v) => v.status === 'draft') && context.permissions.includes('insurance_contract:activate') ? <Activation version={mine.find((v) => v.status === 'draft')!} timeZone={timeZone} onDone={reload} /> : null}
    </section> : null}
  </div>;
};

const PayerForm = ({ existing, onDone }: { existing?: Payer; onDone: (saved?: Payer) => void }) => {
  const context = useAuthorizationContext();
  const [name, setName] = useState(existing?.name ?? ''); const [code, setCode] = useState(existing?.code ?? ''); const [kind, setKind] = useState<PayerKind>(existing?.kind ?? 'hmo');
  const [active, setActive] = useState(existing?.active ?? true); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  return <form className="space-y-3 rounded-card border border-outline-soft bg-white p-4" onSubmit={(e) => { e.preventDefault(); setBusy(true); setError(''); savePayer(context, { id: existing?.id, name, code, kind, active }).then(onDone, (cause) => setError(describeError(cause))).finally(() => setBusy(false)); }}>
    <TextField label="Payer name" value={name} onChange={(e) => setName(e.target.value)} />
    <TextField label="Short code" value={code} onChange={(e) => setCode(e.target.value)} />
    <SelectField label="Kind" value={kind} options={PayerKind.options.map((k) => ({ value: k, label: KIND_LABELS[k] }))} onChange={(e) => setKind(e.target.value as PayerKind)} />
    <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Active</label>
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <div className="flex gap-2"><Button type="submit" fullWidth={false} loading={busy}>Save payer</Button><Button type="button" variant="ghost" fullWidth={false} onClick={() => onDone()}>Cancel</Button></div>
  </form>;
};

const RuleFields = ({ rule, onChange, label, currency }: { rule?: PlanRule; onChange: (rule?: PlanRule) => void; label: string; currency: string }) => {
  const coverage = rule?.coverage ?? '';
  const copay = rule?.coverage === 'covered' ? rule.copay : undefined;
  return <fieldset className="grid gap-2 rounded-field border border-outline-soft p-2 sm:grid-cols-4">
    <legend className="px-1 text-sm font-semibold">{label}</legend>
    <SelectField label="Cover" value={coverage} options={[{ value: '', label: 'Not set' }, { value: 'covered', label: 'Covered' }, { value: 'excluded', label: 'Excluded' }]}
      onChange={(e) => onChange(e.target.value === 'covered' ? { coverage: 'covered', copay: { kind: 'none' }, approvalRequired: false } : e.target.value === 'excluded' ? { coverage: 'excluded' } : undefined)} />
    {rule?.coverage === 'covered' ? <>
      <SelectField label="Co-pay" value={copay!.kind} options={[{ value: 'none', label: 'None' }, { value: 'percent', label: 'Percentage' }, { value: 'fixed', label: 'Fixed amount' }]}
        onChange={(e) => onChange({ ...rule, copay: e.target.value === 'percent' ? { kind: 'percent', basisPoints: 0 } : e.target.value === 'fixed' ? { kind: 'fixed', amountMinor: 0, basis: 'per_unit' } : { kind: 'none' } })} />
      {copay!.kind === 'percent' ? <TextField label="Percent" inputMode="decimal" value={String(copay!.basisPoints / 100)} onChange={(e) => onChange({ ...rule, copay: { kind: 'percent', basisPoints: Math.round(Number(e.target.value || 0) * 100) } })} /> : null}
      {copay!.kind === 'fixed' ? <><TextField label="Amount" inputMode="decimal" value={amountInput(copay!.amountMinor, currency)} onChange={(e) => { try { onChange({ ...rule, copay: { kind: 'fixed', amountMinor: parseAmount(e.target.value || '0', currency), basis: copay!.kind === 'fixed' ? copay!.basis : 'per_unit' } }); } catch { /* keep typing */ } }} />
        <SelectField label="Charged" value={copay!.kind === 'fixed' ? copay!.basis : 'per_unit'} options={FixedCopayBasis.options.map((b) => ({ value: b, label: BASIS_LABELS[b] }))} onChange={(e) => onChange({ ...rule, copay: { kind: 'fixed', amountMinor: copay!.kind === 'fixed' ? copay!.amountMinor : 0, basis: e.target.value as FixedCopayBasis } })} /></> : null}
      <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={rule.approvalRequired} onChange={(e) => onChange({ ...rule, approvalRequired: e.target.checked })} />Needs approval</label>
    </> : null}
    {rule?.coverage === 'excluded' ? <SelectField label="Who pays" value={rule.patientLiability ?? ''} options={[{ value: '', label: 'Not recorded' }, { value: 'patient_pays', label: 'Patient pays' }, { value: 'not_billable', label: 'May not bill the patient' }]}
      onChange={(e) => onChange({ coverage: 'excluded', ...(e.target.value ? { patientLiability: e.target.value as 'patient_pays' | 'not_billable' } : {}) })} /> : null}
  </fieldset>;
};

/** One draft per payer: edits the open draft, or starts the next version from the active one. */
const ContractEditor = ({ payer, fees, draft, base, onSaved }: { payer: Payer; fees: FeeItem[]; draft?: PayerContractVersion; base?: PayerContractVersion; onSaved: () => void }) => {
  const context = useAuthorizationContext(); const toast = useToast();
  const currency = fees[0]?.currency ?? 'NGN';
  const start = (draft ?? base)?.terms ?? { payerId: payer.id, effectiveFrom: '', currency, arrangements: { categories: {}, items: {} }, tariff: {}, plans: [blankPlan()] };
  const [terms, setTerms] = useState<PayerContractTerms>(start as PayerContractTerms);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [unsupported, setUnsupported] = useState<UnsupportedTerm[]>([]);
  const set = (patch: Partial<PayerContractTerms>) => setTerms((t) => ({ ...t, ...patch }));
  const setPlan = (index: number, plan: ContractPlan) => set({ plans: terms.plans.map((p, i) => (i === index ? plan : p)) });
  const gaps = useMemo(() => terms.plans.flatMap((plan) => plan.planCode ? fees.flatMap((fee) => {
    const line = scheduleLineFor(terms, plan, fee.id, fee.category);
    return line.status === 'not_configured' || line.status === 'unsupported' ? [{ plan: plan.planCode, fee: fee.name, why: line.status === 'unsupported' ? `not calculated yet (${line.feature})` : `missing ${line.missing}` }] : [];
  }) : []), [terms, fees]);
  const save = async () => {
    setBusy(true); setError('');
    try {
      const parsed = PayerContractTerms.safeParse({ ...terms, effectiveTo: terms.effectiveTo || undefined, note: terms.note || undefined });
      if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join('.') || 'Contract'}: ${i.message}`).join('; '));
      const saved = await saveContractDraft(context, parsed.data, draft?.revision);
      setUnsupported(saved.unsupported);
      toast(`Draft version ${saved.version.version} saved. Nothing changes for patients until it is activated.`);
      onSaved();
    } catch (cause) { setError(describeError(cause)); } finally { setBusy(false); }
  };
  return <section aria-label="Contract draft" className="space-y-4 rounded-card border border-outline-soft bg-white p-4">
    <h3 className="font-bold">{draft ? `Edit draft version ${draft.version}` : base ? `New version based on version ${base.version}` : 'First contract version'}</h3>
    <div className="grid gap-3 sm:grid-cols-3">
      <TextField label="Starts on" type="date" value={terms.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} />
      <TextField label="Ends on (optional)" type="date" value={terms.effectiveTo ?? ''} onChange={(e) => set({ effectiveTo: e.target.value || undefined })} />
      <TextField label="Currency" value={terms.currency} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} />
    </div>
    <SelectField label="May a member choose to pay without insurance?" value={terms.selfPayElection ?? ''} options={[{ value: '', label: 'Not recorded — not offered at the till' }, { value: 'allowed', label: 'Allowed' }, { value: 'not_allowed', label: 'Not allowed' }]} onChange={(e) => set({ selfPayElection: (e.target.value || undefined) as PayerContractTerms['selfPayElection'] })} />
    <fieldset className="space-y-2"><legend className="font-semibold">How each kind of service is paid</legend>
      <div className="grid gap-2 sm:grid-cols-3">{FeeCategory.options.map((c) => <SelectField key={c} label={CATEGORY_LABELS[c]} value={terms.arrangements.categories[c] ?? ''} options={[{ value: '', label: 'Not set' }, ...Arrangement.options.map((a) => ({ value: a, label: ARRANGEMENT_LABELS[a] }))]}
        onChange={(e) => set({ arrangements: { ...terms.arrangements, categories: { ...terms.arrangements.categories, [c]: e.target.value || undefined } } })} />)}</div>
    </fieldset>
    <fieldset className="space-y-2"><legend className="font-semibold">Each service: price and how it is paid</legend><p className="text-xs text-ink-muted">Leave blank where the contract sets no price. Services paid per service need a price.</p>
      <div className="grid gap-3">{fees.map((fee) => <div key={fee.id} className="grid gap-2 sm:grid-cols-3"><TextField label={`${fee.name}: contract price per unit`} inputMode="decimal" value={terms.tariff[fee.id] ? amountInput(terms.tariff[fee.id].unitMinor, terms.currency) : ''}
        onChange={(e) => { const value = e.target.value.trim(); const tariff = { ...terms.tariff }; if (!value) delete tariff[fee.id]; else { try { tariff[fee.id] = { ...tariff[fee.id], unitMinor: parseAmount(value, terms.currency) }; } catch { return; } } set({ tariff }); }} />
        <TextField label="Payer's code" value={terms.tariff[fee.id]?.payerCode ?? ''} disabled={!terms.tariff[fee.id]} onChange={(e) => set({ tariff: { ...terms.tariff, [fee.id]: { ...terms.tariff[fee.id], payerCode: e.target.value || undefined } } })} />
        <SelectField label="Paid" value={terms.arrangements.items[fee.id] ?? ''} options={[{ value: '', label: `As ${CATEGORY_LABELS[fee.category].toLowerCase()} (${terms.arrangements.categories[fee.category] ? ARRANGEMENT_LABELS[terms.arrangements.categories[fee.category]!].toLowerCase() : 'not set'})` }, ...Arrangement.options.map((a) => ({ value: a, label: ARRANGEMENT_LABELS[a] }))]}
          onChange={(e) => { const items = { ...terms.arrangements.items }; if (e.target.value) items[fee.id] = e.target.value as Arrangement; else delete items[fee.id]; set({ arrangements: { ...terms.arrangements, items } }); }} /></div>)}</div>
    </fieldset>
    {terms.plans.map((plan, index) => <fieldset key={index} className="space-y-2 rounded-field border border-outline p-3"><legend className="px-1 font-semibold">Plan {index + 1}</legend>
      <div className="grid gap-2 sm:grid-cols-2"><TextField label="Plan code (as on the card)" value={plan.planCode} onChange={(e) => setPlan(index, { ...plan, planCode: e.target.value })} /><TextField label="Plan name" value={plan.name} onChange={(e) => setPlan(index, { ...plan, name: e.target.value })} /></div>
      {FeeCategory.options.map((c) => <RuleFields key={c} currency={terms.currency} label={CATEGORY_LABELS[c]} rule={plan.rules.categories[c]} onChange={(rule) => { const categories = { ...plan.rules.categories }; if (rule) categories[c] = rule; else delete categories[c]; setPlan(index, { ...plan, rules: { ...plan.rules, categories } }); }} />)}
      <details><summary className="min-h-[44px] cursor-pointer py-2 text-sm font-semibold">Rules for individual services</summary>
        {fees.map((fee) => <RuleFields key={fee.id} currency={terms.currency} label={fee.name} rule={plan.rules.items[fee.id]} onChange={(rule) => { const items = { ...plan.rules.items }; if (rule) items[fee.id] = rule; else delete items[fee.id]; setPlan(index, { ...plan, rules: { ...plan.rules, items } }); }} />)}
      </details>
      {terms.plans.length > 1 ? <Button variant="ghost" fullWidth={false} onClick={() => set({ plans: terms.plans.filter((_, i) => i !== index) })}>Remove plan</Button> : null}
    </fieldset>)}
    <Button variant="outlined" fullWidth={false} onClick={() => set({ plans: [...terms.plans, blankPlan()] })}>Add plan</Button>
    <TextAreaField label="Note (optional)" value={terms.note ?? ''} onChange={(e) => set({ note: e.target.value || undefined })} />
    <section aria-label="Not yet configured" className="rounded-field bg-surface p-3 text-sm"><h4 className="font-semibold">Not yet configured ({gaps.length})</h4><p className="text-xs text-ink-muted">These services stay undetermined for insured patients — never guessed.</p>
      <ul className="mt-1 max-h-48 overflow-auto">{gaps.slice(0, 100).map((g, i) => <li key={i}>{g.plan} · {g.fee}: {g.why}</li>)}</ul></section>
    {unsupported.length ? <p className="text-sm text-amber-text">Terms Geneus cannot calculate yet: {unsupported.map((u) => `${u.key} (${u.feature})`).join(', ')}. Those services stay undetermined.</p> : null}
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <Button loading={busy} disabled={busy} onClick={() => void save()}>Save draft</Button>
  </section>;
};

/** Activation names every safeguard: device readiness, revoked devices with unsent work, and unsupported terms. */
const Activation = ({ version, timeZone, onDone }: { version: PayerContractVersion; timeZone?: string; onDone: () => void }) => {
  const context = useAuthorizationContext(); const toast = useToast();
  const [devices, setDevices] = useState<DeviceBlocker[]>(); const [acknowledge, setAcknowledge] = useState(false); const [accepted, setAccepted] = useState<string[]>([]);
  const [unsupported, setUnsupported] = useState<UnsupportedTerm[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const check = async () => { setError(''); try { setDevices((await activationReadiness(context)).devices); } catch (cause) { setError(describeError(cause)); } };
  useEffect(() => { void check(); }, [version.id]);
  const blocking = (devices ?? []).filter((d) => !(d.reasons.length === 1 && d.reasons[0] === 'revoked_with_unsent_changes' && accepted.includes(d.deviceId)));
  const activate = async () => {
    setBusy(true); setError('');
    try {
      await activateContract(context, { contractVersionId: version.id, acknowledgeUnsupported: acknowledge, acceptRevokedDevices: accepted });
      toast(`Version ${version.version} is active. Devices receive the patient amounts with their next sync.`); onDone();
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'unsupported_arrangements') setUnsupported((cause.details as { unsupported: UnsupportedTerm[] }).unsupported);
      if (cause instanceof ApiError && cause.code === 'devices_not_ready') setDevices((cause.details as { devices: DeviceBlocker[] }).devices);
      setError(describeError(cause));
    } finally { setBusy(false); }
  };
  const label: Record<string, string> = { no_insurance_support: 'needs the current app', unsent_changes: 'has unsent work', not_seen_in_24_hours: 'not synced in 24 hours', never_reported: 'has never synced', revoked_with_unsent_changes: 'revoked with unsent work' };
  return <section aria-label="Activate draft" className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
    <h3 className="font-bold">Activate draft version {version.version}</h3>
    {!timeZone ? <p role="alert" className="text-sm text-danger">Record the hospital's time zone first.</p> : null}
    {devices === undefined ? <p role="status">Checking devices…</p> : devices.length === 0 ? <p className="text-sm">Every device is ready.</p> : <ul className="space-y-2 text-sm">{devices.map((d) => <li key={d.deviceId} className="rounded-field bg-amber-bg p-2">
      <strong>{d.deviceId}</strong>: {d.reasons.map((r) => label[r] ?? r).join(', ')}{d.pendingMutationCount ? ` (${d.pendingMutationCount} unsent)` : ''}
      {d.reasons.length === 1 && d.reasons[0] === 'revoked_with_unsent_changes' ? <label className="mt-1 flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={accepted.includes(d.deviceId)} onChange={(e) => setAccepted((v) => e.target.checked ? [...v, d.deviceId] : v.filter((x) => x !== d.deviceId))} />I accept that this device's unsent work will never arrive</label> : null}
    </li>)}</ul>}
    <Button variant="ghost" fullWidth={false} onClick={() => void check()}>Check devices again</Button>
    {unsupported.length ? <div className="text-sm"><p>These terms cannot be calculated yet and will stay undetermined:</p><ul className="list-disc pl-5">{unsupported.map((u, i) => <li key={i}>{u.planCode ? `${u.planCode} · ` : ''}{u.key}: {u.feature}</li>)}</ul></div> : null}
    <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={acknowledge} onChange={(e) => setAcknowledge(e.target.checked)} />I understand services with terms Geneus cannot calculate stay undetermined</label>
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <Button loading={busy} disabled={busy || !timeZone || blocking.length > 0} onClick={() => void activate()}>Activate version {version.version}</Button>
  </section>;
};

const EndContract = ({ version, today, onDone }: { version: PayerContractVersion; today?: string; onDone: () => void }) => {
  const context = useAuthorizationContext(); const toast = useToast();
  const [open, setOpen] = useState(false); const [endsOn, setEndsOn] = useState(today ?? ''); const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  if (!open) return <Button variant="ghost" fullWidth={false} onClick={() => setOpen(true)}>End this version</Button>;
  return <div className="mt-2 space-y-2"><p className="text-xs text-ink-muted">Services on or after the end date are no longer covered by this version. Confirmed splits never change.</p>
    <TextField label="Ends on" type="date" min={today} value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
    <TextAreaField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <div className="flex gap-2"><Button fullWidth={false} loading={busy} disabled={busy || !endsOn || !reason.trim()} onClick={() => { setBusy(true); setError(''); endContract(context, { contractVersionId: version.id, endsOn, reason }).then(() => { toast(`Version ${version.version} ends on ${endsOn}.`); setOpen(false); onDone(); }, (cause) => setError(describeError(cause))).finally(() => setBusy(false)); }}>End version</Button><Button variant="ghost" fullWidth={false} onClick={() => setOpen(false)}>Cancel</Button></div>
  </div>;
};
