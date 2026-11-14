import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { approvalNeeded, coversOn, serviceDateOf, type ClaimAuthorization, type Facility, type FeeCategory, type FeeItem, type PatientCover } from '@shared';
import { useLiveQuery } from '@/data';
import { findRecord } from '@/data/db';
import { coversForPatient, listPayers, listSchedules, plansOf, type CoverDraft } from '@/data/repos/insurance';
import { listFeeItems } from '@/data/repos/billing';
import { listAuthorizations, saveAuthorization, VerificationRequired } from '@/lib/api/insurance';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, TextField, useToast } from '@/ui';
import { useDeviceInsurance } from './CoverCard';
import { StaffVerification } from './StaffVerification';

const describeError = (cause: unknown) => cause instanceof VerificationRequired ? 'Your session with the server ended. Confirm your PIN to continue.' : cause instanceof Error ? cause.message : 'The request failed';
const OTHER_PLAN = '__other__';

/* ------------------------------------------------------------------ */
/* Payer and plan, chosen from the hospital's configuration            */
/* ------------------------------------------------------------------ */

export type CoverFieldsValue = Omit<CoverDraft, 'patientId' | 'replaces'>;
export const emptyCover = (): CoverFieldsValue => ({ payerId: '', planCode: '', enrolleeNumber: '', relationship: 'principal', principalName: '', validFrom: '', validTo: '', active: true });
/** What is still missing before a cover can be recorded, or undefined when it is complete. */
export const coverIssue = (v: CoverFieldsValue): string | undefined =>
  !v.payerId ? 'Choose the payer' : !v.planCode.trim() ? 'Choose or type the plan' : !v.enrolleeNumber.trim() ? 'Enter the enrollee number'
    : v.relationship === 'dependant' && !v.principalName?.trim() ? "Enter the principal member's name" : v.validFrom && v.validTo && v.validFrom > v.validTo ? 'The cover must end on or after it starts' : undefined;

/**
 * Payer and plan from the hospital's configured payers and their active
 * plans, so known plan codes are never retyped. A plan the contract does not
 * list yet can still be typed as on the card; it stays undetermined until the
 * contract covers it.
 */
export const CoverFields = ({ value, onChange }: { value: CoverFieldsValue; onChange: (v: CoverFieldsValue) => void }) => {
  const data = useLiveQuery(useCallback(async () => ({ payers: (await listPayers()).filter((p) => p.active), schedules: await listSchedules() }), []), ['payer', 'cover_schedule']);
  const payers = data.data?.payers ?? []; const plans = plansOf(value.payerId, data.data?.schedules ?? []);
  const listed = plans.some((p) => p.code === value.planCode);
  const [typing, setTyping] = useState(false);
  const set = (patch: Partial<CoverFieldsValue>) => onChange({ ...value, ...patch });
  return <div className="grid gap-3 md:grid-cols-2">
    {payers.length === 0 ? <p className="text-sm md:col-span-2">No payers are set up yet. Ask the insurance officer.</p> : null}
    <SelectField label="Payer (HMO or scheme)" value={value.payerId} options={[{ value: '', label: 'Choose…' }, ...payers.map((p) => ({ value: p.id, label: p.name }))]} onChange={(e) => { setTyping(false); set({ payerId: e.target.value, planCode: '' }); }} />
    {plans.length && !typing && (listed || !value.planCode) ? <SelectField label="Plan" value={value.planCode} options={[{ value: '', label: 'Choose…' }, ...plans.map((p) => ({ value: p.code, label: `${p.name} (${p.code})` })), { value: OTHER_PLAN, label: 'Plan not listed — type it as on the card' }]}
      onChange={(e) => { if (e.target.value === OTHER_PLAN) { setTyping(true); set({ planCode: '' }); } else set({ planCode: e.target.value }); }} />
      : <TextField label="Plan code (as on the card)" hint={value.payerId && !plans.length ? 'This payer has no active plans on this device yet.' : undefined} value={value.planCode} onChange={(e) => set({ planCode: e.target.value })} />}
    <TextField label="Enrollee or membership number" value={value.enrolleeNumber} onChange={(e) => set({ enrolleeNumber: e.target.value })} />
    <SelectField label="Member" value={value.relationship} options={[{ value: 'principal', label: 'Principal member' }, { value: 'dependant', label: 'Dependant' }]} onChange={(e) => set({ relationship: e.target.value as PatientCover['relationship'] })} />
    {value.relationship === 'dependant' ? <TextField label="Principal member's name" value={value.principalName ?? ''} onChange={(e) => set({ principalName: e.target.value })} /> : null}
    <TextField label="Valid from (optional)" type="date" value={value.validFrom ?? ''} onChange={(e) => set({ validFrom: e.target.value })} />
    <TextField label="Valid until (optional)" type="date" value={value.validTo ?? ''} onChange={(e) => set({ validTo: e.target.value })} />
  </div>;
};

/**
 * How a new patient pays, chosen at registration. Insurance details are saved
 * with the patient in the same offline write, as cover that is not yet
 * checked: entering a card is not verifying it. Care is never blocked by it.
 */
export const RegistrationPayment = ({ method, onMethod, cover, onCover }: { method: 'self_pay' | 'insurance'; onMethod: (m: 'self_pay' | 'insurance') => void; cover: CoverFieldsValue; onCover: (v: CoverFieldsValue) => void }) => {
  const context = useAuthorizationContext();
  const insurance = useDeviceInsurance();
  if (insurance === undefined || !context.permissions.includes('cover:record')) return null;
  return <section aria-labelledby="registration-payment" className="space-y-4 border-t border-outline-soft pt-6">
    <h2 id="registration-payment" className="text-lg font-extrabold text-ink">How will the patient pay?</h2>
    <SelectField label="Payment" value={method} options={[{ value: 'self_pay', label: 'Self-pay' }, { value: 'insurance', label: 'Insurance or HMO' }]} onChange={(e) => onMethod(e.target.value as 'self_pay' | 'insurance')} />
    {method === 'insurance' ? <>
      <CoverFields value={cover} onChange={onCover} />
      <p className="text-sm text-ink-soft">Saved as cover not yet checked. Check it with the payer from the patient's details; until then insured services show as undetermined, and care continues.</p>
    </> : null}
  </section>;
};

/* ------------------------------------------------------------------ */
/* Payer approval at the point of care (audit H2)                      */
/* ------------------------------------------------------------------ */

export type ApprovalItem = { feeItemId?: string; category: FeeCategory; name: string };

const useApprovalData = (patientId: string) => {
  const context = useAuthorizationContext();
  return useLiveQuery(useCallback(async () => {
    const [covers, schedules, payers, facility] = await Promise.all([coversForPatient(patientId), listSchedules(), listPayers(), findRecord<Facility>('facility', context.facilityId)]);
    return { covers, schedules, payers, date: serviceDateOf(new Date().toISOString(), facility?.timeZone) ?? new Date().toISOString().slice(0, 10) };
  }, [patientId, context.facilityId]), ['patient_cover', 'cover_schedule', 'payer', 'facility']);
};

/**
 * Warns before a service that the patient's payer must approve it first.
 * From synced records only, so it works offline. A warning, never a gate:
 * clinically needed care goes ahead, and an emergency can be recorded as such.
 */
export const ApprovalWarning = ({ patientId, items }: { patientId: string; items: readonly ApprovalItem[] }) => {
  const context = useAuthorizationContext();
  const insurance = useDeviceInsurance();
  const data = useApprovalData(patientId).data;
  if (!data || !patientId || insurance !== 'active' || !items.length) return null;
  const needed = items.flatMap((item) => { const notice = approvalNeeded({ patientId, ...(item.feeItemId ? { feeItemId: item.feeItemId } : {}), category: item.category, date: data.date, records: data }); return notice ? [{ item, notice }] : []; });
  if (!needed.length) return null;
  const payer = data.payers.find((p) => p.id === needed[0].notice.payerId)?.name ?? 'The patient\'s payer';
  return <div role="status" data-testid="approval-warning" className="space-y-1 rounded-field border border-amber-border bg-amber-bg p-3 text-sm">
    <p><strong>{payer} requires its approval for: {needed.map((n) => n.item.name).join(', ')}.</strong> Care is not blocked; without the payer's approval the claim cannot be submitted.</p>
    {context.permissions.includes('cover:verify')
      ? <Link className="font-semibold text-brand underline" to={`/patients/profile?patient=${encodeURIComponent(patientId)}&tab=details#authorizations`}>Record authorization</Link>
      : <p>Ask the insurance desk to obtain and record the approval.</p>}
  </div>;
};

/** At check-in and admission: which services the patient's plan needs approval for, before any is ordered. */
export const PlanApprovalSummary = ({ patientId }: { patientId: string }) => {
  const insurance = useDeviceInsurance();
  const data = useApprovalData(patientId).data;
  const fees = useLiveQuery(listFeeItems).data ?? [];
  if (!data || insurance !== 'active') return null;
  const needs = coversOn(patientId, data.date, data.covers).flatMap((cover) => {
    const schedule = data.schedules.filter((s) => s.payerId === cover.payerId && s.planCode === cover.planCode && s.effectiveFrom <= data.date && (!s.effectiveTo || data.date <= s.effectiveTo) && (!s.endedOn || data.date < s.endedOn)).sort((a, b) => b.contractVersion - a.contractVersion)[0];
    if (!schedule) return [];
    const items = Object.entries(schedule.items).filter(([, l]) => l.status === 'covered' && l.approvalRequired).map(([id]) => fees.find((f: FeeItem) => f.id === id)?.name ?? id);
    const categories = Object.entries(schedule.categories).filter(([, l]) => l?.status === 'covered' && l.approvalRequired).map(([c]) => `all ${c} services`);
    return items.length || categories.length ? [{ payer: data.payers.find((p) => p.id === cover.payerId)?.name ?? cover.payerId, list: [...categories, ...items] }] : [];
  });
  if (!needs.length) return null;
  return <div role="status" data-testid="plan-approval-summary" className="rounded-field border border-outline-soft bg-surface-muted p-3 text-sm">
    {needs.map((n) => <p key={n.payer}><strong>{n.payer}</strong> needs its approval before: {n.list.join(', ')}.</p>)}
  </div>;
};

/* ------------------------------------------------------------------ */
/* Recording a payer's authorization for a patient                     */
/* ------------------------------------------------------------------ */

const STATUS_LABELS: Record<ClaimAuthorization['status'], string> = { requested: 'Requested', approved: 'Approved', denied: 'Denied', emergency_exception: 'Emergency: approval to follow' };

/**
 * A patient's prior authorizations and referrals, recorded online by staff who
 * verify cover. Geneus records the payer's decision; it never makes it.
 */
export const PatientAuthorizations = ({ patientId }: { patientId: string }) => {
  const context = useAuthorizationContext();
  const insurance = useDeviceInsurance();
  if (!insurance || insurance === 'history' || !context.permissions.includes('cover:verify')) return null;
  return <section id="authorizations" aria-label="Authorizations" className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
    <h2 className="font-bold">Payer authorizations and referrals</h2>
    <StaffVerification purpose="Payer authorizations"><AuthorizationsBody patientId={patientId} /></StaffVerification>
  </section>;
};

const AuthorizationsBody = ({ patientId }: { patientId: string }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const covers = useLiveQuery(useCallback(() => coversForPatient(patientId), [patientId]), ['patient_cover']).data ?? [];
  const payers = useLiveQuery(useCallback(() => listPayers(), []), ['payer']).data ?? [];
  const fees = (useLiveQuery(listFeeItems).data ?? []).filter((f) => f.active);
  const [list, setList] = useState<ClaimAuthorization[]>(); const [error, setError] = useState(''); const [adding, setAdding] = useState(false);
  const load = useCallback(async () => { try { setList((await listAuthorizations(context, patientId)).authorizations); setError(''); } catch (cause) { setError(describeError(cause)); } }, [context, patientId]);
  useEffect(() => { void load(); }, [load]);
  const today = new Date().toISOString().slice(0, 10);
  const payerIds = [...new Set(covers.map((c) => c.payerId))];
  const [form, setForm] = useState({ payerId: '', kind: 'pre_authorization' as 'pre_authorization' | 'referral', status: 'approved' as ClaimAuthorization['status'], reference: '', validFrom: today, validTo: today,
    feeItemId: '', quantity: '', requestedOn: '', obtainedVia: 'phone' as ClaimAuthorization['obtainedVia'], referredFrom: '', note: '', replaces: '' });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const live = (list ?? []).filter((a) => !a.replacedBy);
  const save = async () => {
    try {
      await saveAuthorization(context, { patientId, payerId: form.payerId || payerIds[0], kind: form.kind, status: form.status, validFrom: form.validFrom, validTo: form.validTo,
        feeItemIds: form.feeItemId ? [form.feeItemId] : [], categories: [], approvedQuantities: form.feeItemId && Number(form.quantity) > 0 && form.status === 'approved' ? { [form.feeItemId]: Number(form.quantity) } : {},
        obtainedVia: form.obtainedVia, ...(form.reference.trim() ? { reference: form.reference.trim() } : {}), ...(form.requestedOn ? { requestedOn: form.requestedOn } : {}),
        ...(form.referredFrom.trim() ? { referredFrom: form.referredFrom.trim() } : {}), ...(form.note.trim() ? { note: form.note.trim() } : {}), ...(form.replaces ? { replaces: form.replaces } : {}) });
      toast('Recorded.'); setAdding(false); await load();
    } catch (cause) { setError(describeError(cause)); }
  };
  const feeName = (id: string) => fees.find((f) => f.id === id)?.name ?? id;
  return <div className="space-y-3">
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {!list ? <p role="status" className="text-sm">Loading…</p> : live.length === 0 ? <p className="text-sm text-ink-soft">None recorded.</p> : <ul className="space-y-1 text-sm">{live.map((a) => <li key={a.id}>
      {a.kind === 'referral' ? 'Referral' : 'Authorization'} · <strong>{STATUS_LABELS[a.status]}</strong>{a.reference ? ` · ${a.reference}` : ''} · {a.validFrom} to {a.validTo}
      {a.feeItemIds.length ? ` · ${a.feeItemIds.map((id) => `${feeName(id)}${a.approvedQuantities[id] ? ` × ${a.approvedQuantities[id]}` : ''}`).join(', ')}` : ''}{a.note ? ` · ${a.note}` : ''}</li>)}</ul>}
    {payerIds.length === 0 ? <p className="text-sm text-ink-soft">Record the patient's insurance cover first.</p> : !adding ? <Button variant="outlined" fullWidth={false} onClick={() => setAdding(true)}>Record authorization or referral</Button> : <form aria-label="Record authorization" className="space-y-2 rounded-field border border-outline-soft p-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="grid gap-2 md:grid-cols-2">
        {payerIds.length > 1 ? <SelectField label="Payer" value={form.payerId || payerIds[0]} options={payerIds.map((id) => ({ value: id, label: payers.find((p) => p.id === id)?.name ?? id }))} onChange={(e) => set({ payerId: e.target.value })} /> : null}
        <SelectField label="Kind" value={form.kind} options={[{ value: 'pre_authorization', label: 'Prior authorization' }, { value: 'referral', label: 'Referral' }]} onChange={(e) => set({ kind: e.target.value as typeof form.kind })} />
        <SelectField label="Status" value={form.status} options={(['requested', 'approved', 'denied', ...(form.kind === 'pre_authorization' ? ['emergency_exception'] : [])] as ClaimAuthorization['status'][]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))} onChange={(e) => set({ status: e.target.value as ClaimAuthorization['status'] })} />
        <TextField label={form.kind === 'referral' ? 'Referral number' : "Payer's authorization code"} value={form.reference} onChange={(e) => set({ reference: e.target.value })} />
        {form.kind === 'pre_authorization' ? <SelectField label="Service" value={form.feeItemId} options={[{ value: '', label: 'Choose the service…' }, ...fees.map((f) => ({ value: f.id, label: f.name }))]} onChange={(e) => set({ feeItemId: e.target.value })} /> : <TextField label="Referred from (optional)" value={form.referredFrom} onChange={(e) => set({ referredFrom: e.target.value })} />}
        {form.kind === 'pre_authorization' && form.status === 'approved' && form.feeItemId ? <TextField label="Quantity approved (optional)" inputMode="numeric" value={form.quantity} onChange={(e) => set({ quantity: e.target.value.replace(/\D/g, '') })} /> : null}
        <TextField label="Valid from" type="date" value={form.validFrom} onChange={(e) => set({ validFrom: e.target.value })} />
        <TextField label="Valid to" type="date" value={form.validTo} onChange={(e) => set({ validTo: e.target.value })} />
        <TextField label="Requested on (optional)" type="date" value={form.requestedOn} onChange={(e) => set({ requestedOn: e.target.value })} />
        <SelectField label="Obtained by" value={form.obtainedVia} options={['phone', 'portal', 'email', 'letter', 'other'].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) }))} onChange={(e) => set({ obtainedVia: e.target.value as typeof form.obtainedVia })} />
        {live.length ? <SelectField label="Updates an earlier record (optional)" value={form.replaces} options={[{ value: '', label: 'No — a new record' }, ...live.filter((a) => a.kind === form.kind).map((a) => ({ value: a.id, label: `${STATUS_LABELS[a.status]}${a.reference ? ` · ${a.reference}` : ''} · ${a.validFrom}` }))]} onChange={(e) => set({ replaces: e.target.value })} /> : null}
      </div>
      <TextField label={form.status === 'emergency_exception' ? 'Why care could not wait for approval' : 'Note (optional)'} value={form.note} onChange={(e) => set({ note: e.target.value })} />
      {form.status === 'emergency_exception' ? <p className="text-xs text-amber-text">Care continues. The claim stays blocked until the payer's decision is recorded as an update to this record.</p> : null}
      <div className="flex gap-2"><Button type="submit" fullWidth={false}>Save</Button><Button type="button" variant="ghost" fullWidth={false} onClick={() => setAdding(false)}>Cancel</Button></div>
    </form>}
  </div>;
};
