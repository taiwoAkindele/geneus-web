import { useState } from 'react';
import { FacilityDetailsUpdate, type Facility, type FacilityDetails } from '@shared';
import { Button, SelectField, Sheet, SheetCancelButton, TextAreaField, TextField, useToast } from '@/ui';
import { useLiveQuery } from '@/data';
import { getFacility } from '@/data/repos/facility';
import { saveFacilityDetails, saveTimeZone } from '@/lib/api/selfService';
import { FEE_CURRENCIES } from '@/modules/finance/billing/feeForm';
import { useAuthorizationContext } from '@/session';
import { FacilityDetailsFields } from '@/modules/administration/screens/facility-onboarding/FacilityDetailsFields';
import { timeZoneOptions } from '@/lib/timeZoneOptions';
import { StaffVerification } from '@/modules/insurance/StaffVerification';

/** Where a facility is decides the time zone and currency it starts with. */
export const COUNTRIES = [
  { code: 'NG', name: 'Nigeria', timeZone: 'Africa/Lagos', currency: 'NGN' },
  { code: 'GH', name: 'Ghana', timeZone: 'Africa/Accra', currency: 'GHS' },
  { code: 'KE', name: 'Kenya', timeZone: 'Africa/Nairobi', currency: 'KES' },
  { code: 'ZA', name: 'South Africa', timeZone: 'Africa/Johannesburg', currency: 'ZAR' },
] as const;
export const countryDefaults = (code: string) => COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];

type Form = FacilityDetails & { country: string; currency: string; address: string; phone: string; timeZone: string };
/** What registration already captured, with Nigeria and its zone and currency where nothing was said. */
export const facilityForm = (facility: Facility): Form => {
  const country = facility.country ?? 'NG', defaults = countryDefaults(country);
  return { code: facility.code, name: facility.name, state: facility.state, lga: facility.lga, level: facility.level as FacilityDetails['level'],
    country, currency: facility.currency ?? defaults.currency, address: facility.address ?? '', phone: facility.phone ?? '', timeZone: facility.timeZone ?? defaults.timeZone };
};

const DetailsForm = ({ facility, onClose }: { facility: Facility; onClose?: () => void }) => {
  const context = useAuthorizationContext(), toast = useToast();
  const [form, setForm] = useState<Form>(() => facilityForm(facility));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [zoneReason, setZoneReason] = useState(''), [zoneConfirmed, setZoneConfirmed] = useState(false);
  const timeZoneChanged = form.timeZone !== facility.timeZone;
  const correcting = Boolean(facility.timeZone) && timeZoneChanged;
  const needsZoneConfirmation = correcting && (!zoneConfirmed || zoneReason.trim().length < 5);
  const patch = (next: Partial<Form>) => setForm((before) => ({ ...before, ...next }));
  const chooseCountry = (code: string) => {
    const was = countryDefaults(form.country), next = countryDefaults(code);
    // Follow the country unless someone already chose otherwise.
    patch({ country: code, ...(form.currency === was.currency ? { currency: next.currency } : {}), ...(!facility.timeZone && form.timeZone === was.timeZone ? { timeZone: next.timeZone } : {}) });
  };
  const save = async () => {
    if (busy || needsZoneConfirmation) return;
    const details = FacilityDetailsUpdate.safeParse({ name: form.name, level: form.level, state: form.state, lga: form.lga, country: form.country, currency: form.currency,
      ...(form.address.trim() ? { address: form.address.trim() } : {}), ...(form.phone.trim() ? { phone: form.phone.trim() } : {}) });
    if (!details.success) { setError(details.error.issues.map((i) => i.message).join('. ')); return; }
    setBusy(true); setError('');
    let detailsSaved = false;
    try {
      await saveFacilityDetails(context, details.data);
      detailsSaved = true;
      if (timeZoneChanged) await saveTimeZone(context, form.timeZone, correcting ? zoneReason : undefined);
      toast('Facility details saved. They reach every device with the next sync.');
      onClose?.();
    } catch (cause) { setError(`${detailsSaved ? 'Facility details were saved, but the time zone could not be changed. ' : ''}${cause instanceof Error ? cause.message : 'The details could not be saved'}`); } finally { setBusy(false); }
  };
  const content = <form noValidate className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <FacilityDetailsFields codeLocked value={form} onChange={patch} disabled={busy} countryField={
      <SelectField label="Country" name="facility_country" value={form.country} onChange={(e) => chooseCountry(e.target.value)} options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} />
    } />
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Currency" name="facility_currency" disabled={busy} value={form.currency} onChange={(e) => patch({ currency: e.target.value })} options={FEE_CURRENCIES} help={{ purpose: 'New prices start in this currency. Existing fees keep their own.' }} />
      <SelectField label="Time zone" name="facility_time_zone" disabled={busy} value={form.timeZone} onChange={(e) => { patch({ timeZone: e.target.value }); setZoneConfirmed(false); }}
        options={timeZoneOptions(form.timeZone)} help={{ purpose: 'Dates on bills, claims and reports use this time zone.' }} />
    </div>
    {correcting ? <div className="space-y-3 rounded-field border border-amber-border bg-amber-bg p-3 text-sm">
      <p>Changing the time zone applies from now. Services already recorded keep their dates.</p>
      <TextAreaField label="Reason for time zone correction" name="facility_time_zone_reason" maxLength={500} disabled={busy} value={zoneReason} onChange={(event) => setZoneReason(event.target.value)} />
      <label className="flex min-h-11 items-center gap-2"><input type="checkbox" disabled={busy} checked={zoneConfirmed} onChange={(event) => setZoneConfirmed(event.target.checked)} />I confirm {form.timeZone} is this facility's local time zone</label>
    </div> : null}
    <TextField label="Phone (optional)" name="facility_phone" type="tel" disabled={busy} value={form.phone} onChange={(e) => patch({ phone: e.target.value })} />
    <TextField label="Address (optional)" name="facility_address" disabled={busy} value={form.address} onChange={(e) => patch({ address: e.target.value })} />
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <StaffVerification purpose="Changing facility details"><div className={onClose ? 'grid grid-cols-2 gap-3' : ''}>
      <Button type="submit" fullWidth={Boolean(onClose)} loading={busy} disabled={busy || needsZoneConfirmation}>{onClose ? 'Save changes' : 'Save facility details'}</Button>
      {onClose ? <SheetCancelButton disabled={busy} /> : null}
    </div></StaffVerification>
  </form>;
  return onClose ? <Sheet title="Edit facility details" placement="side" onClose={onClose} closeDisabled={busy} hasUnsavedChanges={JSON.stringify(form) !== JSON.stringify(facilityForm(facility))}>{content}</Sheet> : content;
};

/**
 * Step 1: the details registration already captured, ready to confirm or
 * correct, with the time zone and currency set from the country.
 */
export const FacilityDetailsStep = ({ mode = 'setup' }: { mode?: 'setup' | 'settings' }) => {
  const facility = useLiveQuery(getFacility, ['facility']).data;
  const context = useAuthorizationContext();
  const [editing, setEditing] = useState(false);
  if (!facility) return <p className="text-sm text-ink-muted">Reading facility details…</p>;
  const values = facilityForm(facility);
  const levelNames = { chc: 'Community health centre', phc: 'Primary', general_hospital: 'Secondary', teaching_hospital: 'Tertiary', specialist: 'Specialist' };
  const summary = <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">{[
    ['Facility', facility.name], ['Facility code', facility.code], ['Level of care', levelNames[facility.level]],
    ['Country', COUNTRIES.find((c) => c.code === values.country)?.name ?? values.country], ['State', facility.state], ['LGA', facility.lga],
    ['Address', facility.address], ['Phone', facility.phone], ['Currency', values.currency], ['Time zone', facility.timeZone],
  ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-ink-muted">{label}</dt><dd className="break-words font-bold">{value || 'Not set'}</dd></div>)}</dl>;
  // The server lets only a writable facility administrator change these.
  if (!(context.role === 'facility_admin' || context.roles?.includes('facility_admin')) || !context.permissions.includes('staff:manage')) return summary;
  return <div className="space-y-5">
    {mode === 'settings' ? <>{summary}<Button fullWidth={false} variant="outlined" aria-haspopup="dialog" onClick={() => setEditing(true)}>Edit facility details</Button>{editing ? <DetailsForm facility={facility} onClose={() => setEditing(false)} /> : null}</> : <DetailsForm facility={facility} />}
  </div>;
};
