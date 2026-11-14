import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { serviceDateOf, type CoverCheck, type PatientCover } from '@shared';
import { useLiveQuery } from '@/data';
import { checksForPatient, coversForPatient, currentCovers, listPayers, recordCheck, recordCover } from '@/data/repos/insurance';
import { findRecord } from '@/data/db';
import { deviceInsurance, INSURANCE_SUPPORT_EVENT, type DeviceInsurance } from '@/data/insuranceSupport';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, Sheet, TextAreaField, TextField } from '@/ui';
import { CHECK_METHODS, CHECK_RESULTS } from './coverageLabels';
import type { Facility } from '@shared';

/** What this device was granted: setup (configure, no bill changes), active (billing), or nothing. */
export const useDeviceInsurance = (): DeviceInsurance | undefined => {
  const context = useAuthorizationContext();
  const [state, setState] = useState(() => deviceInsurance(context));
  useEffect(() => {
    const refresh = () => setState(deviceInsurance(context));
    refresh();
    window.addEventListener(INSURANCE_SUPPORT_EVENT, refresh);
    return () => window.removeEventListener(INSURANCE_SUPPORT_EVENT, refresh);
  }, [context.facilityId, context.deviceId]);
  return state;
};
export const useInsuranceSupported = () => useDeviceInsurance() !== undefined;

const COVER_TABLES = ['patient_cover', 'cover_check', 'payer', 'facility'] as const;

/**
 * A patient's insurance cover on the Details tab. Recording cover and checks
 * works offline; the server checks both on sync. Covers and checks are never
 * edited: a change is a new cover that replaces the old, and every check stays
 * in the history.
 */
export const CoverCard = ({ patientId }: { patientId: string }) => {
  const context = useAuthorizationContext();
  const insurance = useDeviceInsurance();
  const supported = insurance !== undefined;
  const data = useLiveQuery(useCallback(async () => {
    const [covers, checks, payers, facility] = await Promise.all([coversForPatient(patientId), checksForPatient(patientId), listPayers(), findRecord<Facility>('facility', context.facilityId)]);
    return { covers, checks, payers, timeZone: facility?.timeZone };
  }, [patientId, context.facilityId]), COVER_TABLES);
  const [editing, setEditing] = useState<PatientCover | 'new'>();
  const [checking, setChecking] = useState<PatientCover>();
  if (!supported || !data.data) return null;
  const { covers, checks, payers, timeZone } = data.data;
  const current = currentCovers(patientId, covers);
  const payerName = (id: string) => payers.find((p) => p.id === id)?.name ?? 'Payer not available on this device';
  const today = serviceDateOf(new Date().toISOString(), timeZone);
  const canRecord = context.permissions.includes('cover:record');
  const canCheck = context.permissions.includes('cover:verify');
  return <section aria-label="Insurance cover" className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">Insurance cover</h2>{canRecord ? <Button variant="outlined" fullWidth={false} onClick={() => setEditing('new')}>Add cover</Button> : null}</div>
    {insurance === 'history' ? <p className="text-sm text-ink-soft">Insurance billing is off. Charges raised while it was on keep their insurance treatment; new charges are billed as cash.</p> : null}
    {insurance === 'setup' ? <p className="text-sm text-ink-soft">The hospital is setting up insurance. Cover can be recorded now; bills are not affected until insurance billing starts.</p> : null}
    {current.length === 0 ? <p className="text-sm text-ink-soft">No insurance recorded. The patient pays for care themselves.</p> : current.map((cover) => {
      const history = checks.filter((c) => c.coverId === cover.id).sort((a, b) => b.createdOn.localeCompare(a.createdOn));
      const latest = history[0];
      const checkedToday = today && history.some((c) => c.coversFrom <= today && today <= c.coversTo);
      return <article key={cover.id} className="space-y-2 rounded-field border border-outline-soft p-3">
        <h3 className="font-bold">{payerName(cover.payerId)} · {cover.planCode}</h3>
        <p className="text-sm">Enrollee number <span className="font-mono">{cover.enrolleeNumber}</span> · {cover.relationship === 'principal' ? 'Principal' : `Dependant${cover.principalName ? ` of ${cover.principalName}` : ''}`}</p>
        <p className="text-xs text-ink-muted">{cover.active ? 'Active' : 'Inactive'}{cover.validFrom ? ` · from ${cover.validFrom}` : ''}{cover.validTo ? ` · until ${cover.validTo}` : ''}</p>
        {latest ? <p className="text-sm">Last check: <strong>{CHECK_RESULTS.find((r) => r.value === latest.result)?.label}</strong> for {latest.coversFrom === latest.coversTo ? latest.coversFrom : `${latest.coversFrom} to ${latest.coversTo}`} · {CHECK_METHODS.find((m) => m.value === latest.method)?.label}{latest.reference ? ` · ref ${latest.reference}` : ''}</p> : <p className="text-sm text-amber-text">Never checked. Bills stay undetermined until cover is checked.</p>}
        {!checkedToday && cover.active ? <p className="text-sm text-amber-text">Not checked for today.</p> : null}
        <div className="flex flex-wrap gap-2">
          {canCheck ? <Button fullWidth={false} variant={checkedToday ? 'ghost' : 'primary'} onClick={() => setChecking(cover)}>Record check</Button> : null}
          {canRecord ? <Button fullWidth={false} variant="ghost" onClick={() => setEditing(cover)}>Change cover</Button> : null}
        </div>
        {history.length > 1 ? <details className="text-xs text-ink-muted"><summary className="min-h-[44px] cursor-pointer py-2">All checks ({history.length})</summary><ul className="space-y-1">{history.map((c) => <li key={c.id}>{new Date(c.createdOn).toLocaleString('en-GB')} · {CHECK_RESULTS.find((r) => r.value === c.result)?.label} · {c.coversFrom}–{c.coversTo}</li>)}</ul></details> : null}
      </article>;
    })}
    {editing ? <CoverSheet patientId={patientId} existing={editing === 'new' ? undefined : editing} payers={payers.filter((p) => p.active)} onClose={() => setEditing(undefined)} /> : null}
    {checking ? <CheckSheet cover={checking} today={today} onClose={() => setChecking(undefined)} /> : null}
  </section>;
};

const CoverSheet = ({ patientId, existing, payers, onClose }: { patientId: string; existing?: PatientCover; payers: { id: string; name: string }[]; onClose: () => void }) => {
  const context = useAuthorizationContext();
  const [payerId, setPayerId] = useState(existing?.payerId ?? payers[0]?.id ?? ''); const [planCode, setPlan] = useState(existing?.planCode ?? '');
  const [enrollee, setEnrollee] = useState(existing?.enrolleeNumber ?? ''); const [relationship, setRelationship] = useState<PatientCover['relationship']>(existing?.relationship ?? 'principal');
  const [principalName, setPrincipal] = useState(existing?.principalName ?? ''); const [validFrom, setFrom] = useState(existing?.validFrom ?? ''); const [validTo, setTo] = useState(existing?.validTo ?? '');
  const [active, setActive] = useState(existing?.active ?? true); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError('');
    try {
      if (!payerId || !planCode.trim() || !enrollee.trim()) throw new Error('Choose the payer and enter the plan and enrollee number');
      await recordCover({ patientId, payerId, planCode: planCode.trim(), enrolleeNumber: enrollee, relationship, principalName, validFrom, validTo, active, replaces: existing?.id }, context);
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the cover'); } finally { setBusy(false); }
  };
  return <Sheet title={existing ? 'Change insurance cover' : 'Add insurance cover'} onClose={onClose} closeDisabled={busy}>
    <div className="space-y-3">
      {payers.length === 0 ? <p className="text-sm">No payers are set up yet. Ask the insurance officer.</p> : null}
      <SelectField label="Payer" value={payerId} options={payers.map((p) => ({ value: p.id, label: p.name }))} onChange={(e) => setPayerId(e.target.value)} />
      <TextField label="Plan code (as on the card)" value={planCode} onChange={(e) => setPlan(e.target.value)} />
      <TextField label="Enrollee number" value={enrollee} onChange={(e) => setEnrollee(e.target.value)} />
      <SelectField label="Member" value={relationship} options={[{ value: 'principal', label: 'Principal member' }, { value: 'dependant', label: 'Dependant' }]} onChange={(e) => setRelationship(e.target.value as PatientCover['relationship'])} />
      {relationship === 'dependant' ? <TextField label="Principal member's name" value={principalName} onChange={(e) => setPrincipal(e.target.value)} /> : null}
      <div className="grid gap-3 sm:grid-cols-2"><TextField label="Valid from (optional)" type="date" value={validFrom} onChange={(e) => setFrom(e.target.value)} /><TextField label="Valid until (optional)" type="date" value={validTo} onChange={(e) => setTo(e.target.value)} /></div>
      <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Cover is active</label>
      {existing ? <p className="text-xs text-ink-muted">The previous cover stays in the history. Bills already confirmed keep the cover they were confirmed with.</p> : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button loading={busy} disabled={busy || payers.length === 0} onClick={() => void save()}>Save cover</Button>
    </div>
  </Sheet>;
};

const CheckSheet = ({ cover, today, onClose }: { cover: PatientCover; today?: string; onClose: () => void }) => {
  const context = useAuthorizationContext();
  const [method, setMethod] = useState<CoverCheck['method']>('portal'); const [result, setResult] = useState<CoverCheck['result']>('verified');
  const [from, setFrom] = useState(today ?? ''); const [to, setTo] = useState(today ?? ''); const [reference, setReference] = useState(''); const [note, setNote] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setError('');
    try {
      if (!from || !to || from > to) throw new Error('Enter the dates the payer confirmed, the start on or before the end');
      await recordCheck({ patientId: cover.patientId, coverId: cover.id, method, result, coversFrom: from, coversTo: to, reference, note }, context);
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save the check'); } finally { setBusy(false); }
  };
  return <Sheet title="Record cover check" eyebrow={`${cover.planCode} · ${cover.enrolleeNumber}`} onClose={onClose} closeDisabled={busy}>
    <div className="space-y-3">
      {!today ? <p role="alert" className="text-sm text-danger">The hospital's time zone is not recorded, so insurance dates cannot be set. Ask an administrator.</p> : null}
      <SelectField label="How did you check?" value={method} options={CHECK_METHODS.map((m) => ({ ...m }))} onChange={(e) => setMethod(e.target.value as CoverCheck['method'])} />
      <SelectField label="Result" value={result} options={CHECK_RESULTS.map((r) => ({ ...r }))} onChange={(e) => setResult(e.target.value as CoverCheck['result'])} />
      <p className="text-xs text-ink-muted">Enter only the dates the payer confirmed. Geneus never assumes how long a check lasts.</p>
      <div className="grid gap-3 sm:grid-cols-2"><TextField label="Covers from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /><TextField label="Covers until" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      <TextField label="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
      <TextAreaField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button loading={busy} disabled={busy || !today} onClick={() => void save()}>Save check</Button>
    </div>
  </Sheet>;
};

/** At check-in: a prompt, never a gate. Care continues whatever the cover state. */
export const CheckInCoverPrompt = ({ patientId, onRecord, recordHref }: { patientId: string; onRecord?: () => void; recordHref?: string }) => {
  // During setup cover does not change bills, so the desk is not prompted yet.
  const supported = useDeviceInsurance() === 'active';
  const context = useAuthorizationContext();
  const data = useLiveQuery(useCallback(async () => {
    const [covers, checks, facility] = await Promise.all([coversForPatient(patientId), checksForPatient(patientId), findRecord<Facility>('facility', context.facilityId)]);
    const today = serviceDateOf(new Date().toISOString(), facility?.timeZone);
    const current = currentCovers(patientId, covers).filter((c) => c.active);
    return today ? current.find((cover) => !checks.some((c) => c.coverId === cover.id && c.coversFrom <= today && today <= c.coversTo)) : undefined;
  }, [patientId, context.facilityId]), COVER_TABLES);
  if (!supported || !data.data || !context.permissions.includes('cover:verify')) return null;
  return <div role="status" className="flex flex-wrap items-center gap-2 rounded-field border border-amber-border bg-amber-bg p-3 text-sm">
    <span className="flex-1"><strong>Cover not checked today.</strong> Bills stay undetermined until it is checked; care continues.</span>
    {onRecord ? <Button fullWidth={false} variant="outlined" onClick={onRecord}>Record check</Button> : recordHref ? <Link className="min-h-[44px] content-center font-bold text-brand underline" to={recordHref}>Record check</Link> : null}
  </div>;
};
