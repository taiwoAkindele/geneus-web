import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Facility } from '@shared';
import { useLiveQuery } from '@/data';
import { findRecord } from '@/data/db';
import { saveTimeZone, timeZoneHistory, type TimeZoneChange } from '@/lib/api/selfService';
import { VerificationRequired } from '@/lib/api/insurance';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, TextAreaField, useToast } from '@/ui';
import { StaffVerification } from '@/modules/insurance/StaffVerification';

const ZONES: string[] = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? ['Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'Africa/Johannesburg', 'Europe/London', 'UTC'];
const describeError = (cause: unknown) => cause instanceof VerificationRequired ? 'Your verification ended. Verify again to continue.' : cause instanceof Error ? cause.message : 'The request failed';

/**
 * Facility-wide settings a hospital administrator manages for itself. The
 * time zone dates services in local time for billing, insurance and reports.
 * A correction applies from the moment it is saved: everything recorded
 * before keeps the date it had, and confirmed insurance splits never change.
 */
export const FacilitySettings = () => {
  const context = useAuthorizationContext();
  const facility = useLiveQuery(useCallback(() => findRecord<Facility>('facility', context.facilityId), [context.facilityId]), ['facility']).data;
  const isAdmin = context.role === 'facility_admin' || Boolean(context.roles?.includes('facility_admin'));
  return <section aria-label="Facility settings" className="space-y-4">
    <div className="rounded-card border border-outline-soft bg-white p-5">
      <h2 className="text-lg font-bold">Time zone</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">Every service is dated in this time zone: bills, insurance cover checks, contract dates and reports. Nigerian facilities use Africa/Lagos.</p>
      <p data-testid="facility-time-zone" className="mt-3 text-sm">{facility?.timeZone ? <>Current: <strong>{facility.timeZone}</strong></> : <strong className="text-amber-text">Not configured yet</strong>}</p>
      {isAdmin ? <div className="mt-4"><StaffVerification purpose="Changing facility settings"><TimeZoneForm current={facility?.timeZone} /></StaffVerification></div>
        : <p className="mt-3 text-sm text-ink-soft">A facility administrator sets this.</p>}
    </div>
  </section>;
};

const TimeZoneForm = ({ current }: { current?: string }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [zone, setZone] = useState(current ?? 'Africa/Lagos'); const [reason, setReason] = useState(''); const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [changes, setChanges] = useState<TimeZoneChange[]>([]);
  const load = useCallback(() => timeZoneHistory(context).then((r) => setChanges(r.changes), () => undefined), [context]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (current) setZone(current); }, [current]);
  const options = useMemo(() => [...new Set(['Africa/Lagos', ...ZONES])].map((z) => ({ value: z, label: z })), []);
  const correcting = Boolean(current) && zone !== current;
  const save = async () => {
    setBusy(true); setError('');
    try {
      const result = await saveTimeZone(context, zone, correcting ? reason : undefined);
      toast(result.changed ? `Time zone set to ${result.timeZone}. It reaches every device with the next sync.` : 'No change.');
      setConfirmed(false); setReason(''); void load();
    } catch (cause) { setError(describeError(cause)); } finally { setBusy(false); }
  };
  return <form aria-label="Time zone" className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
    <SelectField label="Facility time zone" value={zone} options={options} onChange={(e) => { setZone(e.target.value); setConfirmed(false); }} />
    {correcting ? <>
      <p role="alert" className="rounded-field border border-amber-border bg-amber-bg p-3 text-sm">Correcting the time zone applies from now. Services already recorded keep their dates, and confirmed insurance splits and claims do not change.</p>
      <TextAreaField label="Why it is being corrected" value={reason} onChange={(e) => setReason(e.target.value)} />
    </> : null}
    <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I confirm {zone} is this facility's local time zone</label>
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <Button type="submit" fullWidth={false} loading={busy} disabled={!confirmed || zone === current || (correcting && reason.trim().length < 5)}>{current ? 'Save correction' : 'Save time zone'}</Button>
    {changes.length ? <details><summary className="cursor-pointer text-sm font-semibold">Change history</summary><ul className="mt-2 space-y-1 text-sm">{changes.map((c, i) =>
      <li key={i}>{new Date(c.on).toLocaleString('en-GB')} · {c.from ? `${c.from} → ` : 'Set to '}{c.to} · {c.by}{c.reason ? ` · ${c.reason}` : ''}</li>)}</ul></details> : null}
  </form>;
};
