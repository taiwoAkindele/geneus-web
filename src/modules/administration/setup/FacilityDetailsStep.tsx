import { useEffect, useState } from 'react';
import { FacilityDetailsUpdate, type Facility, type FacilityDetails } from '@shared';
import { Button, SelectField, TextField, useToast } from '@/ui';
import { useLiveQuery } from '@/data';
import { getFacility } from '@/data/repos/facility';
import { saveFacilityDetails, saveTimeZone } from '@/lib/api/selfService';
import { FEE_CURRENCIES } from '@/modules/finance/billing/feeForm';
import { useAuthorizationContext } from '@/session';
import { FacilityDetailsFields } from '@/modules/administration/screens/facility-onboarding/FacilityDetailsFields';
import { FacilitySettings } from '@/modules/operations/workforce/FacilitySettings';
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

const DetailsForm = ({ facility }: { facility: Facility }) => {
  const context = useAuthorizationContext(), toast = useToast();
  const [form, setForm] = useState<Form>(() => facilityForm(facility));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { setForm(facilityForm(facility)); }, [facility.updatedOn, facility.timeZone]); // eslint-disable-line react-hooks/exhaustive-deps
  const patch = (next: Partial<Form>) => setForm((before) => ({ ...before, ...next }));
  const chooseCountry = (code: string) => {
    const was = countryDefaults(form.country), next = countryDefaults(code);
    // Follow the country unless someone already chose otherwise.
    patch({ country: code, ...(form.currency === was.currency ? { currency: next.currency } : {}), ...(!facility.timeZone && form.timeZone === was.timeZone ? { timeZone: next.timeZone } : {}) });
  };
  const save = async () => {
    if (busy) return;
    const details = FacilityDetailsUpdate.safeParse({ name: form.name, level: form.level, state: form.state, lga: form.lga, country: form.country, currency: form.currency,
      ...(form.address.trim() ? { address: form.address.trim() } : {}), ...(form.phone.trim() ? { phone: form.phone.trim() } : {}) });
    if (!details.success) { setError(details.error.issues.map((i) => i.message).join('. ')); return; }
    setBusy(true); setError('');
    try {
      await saveFacilityDetails(context, details.data);
      // A first time zone is recorded with the details; changing one later is a correction with a reason, below.
      if (!facility.timeZone) await saveTimeZone(context, form.timeZone);
      toast('Facility details saved. They reach every device with the next sync.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The details could not be saved'); } finally { setBusy(false); }
  };
  return <div className="space-y-4">
    <FacilityDetailsFields codeLocked value={form} onChange={patch} disabled={busy} />
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Country" name="facility_country" value={form.country} onChange={(e) => chooseCountry(e.target.value)} options={COUNTRIES.map((c) => ({ value: c.code, label: c.name }))} />
      <SelectField label="Currency" name="facility_currency" value={form.currency} onChange={(e) => patch({ currency: e.target.value })} options={FEE_CURRENCIES} help={{ purpose: 'New prices start in this currency. Existing fees keep their own.' }} />
      {!facility.timeZone ? <SelectField label="Time zone" name="facility_time_zone" value={form.timeZone} onChange={(e) => patch({ timeZone: e.target.value })}
        options={[...new Set([form.timeZone, ...COUNTRIES.map((c) => c.timeZone)])].map((zone) => ({ value: zone, label: zone }))} help={{ purpose: 'Dates on bills, claims and reports use this time zone.' }} /> : null}
      <TextField label="Phone (optional)" name="facility_phone" type="tel" value={form.phone} onChange={(e) => patch({ phone: e.target.value })} />
    </div>
    <TextField label="Address (optional)" name="facility_address" value={form.address} onChange={(e) => patch({ address: e.target.value })} />
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    <StaffVerification purpose="Changing facility details"><Button fullWidth={false} loading={busy} disabled={busy} onClick={save}>Save facility details</Button></StaffVerification>
  </div>;
};

/**
 * Step 1: the details registration already captured, ready to confirm or
 * correct, with the time zone and currency set from the country.
 */
export const FacilityDetailsStep = () => {
  const facility = useLiveQuery(getFacility, ['facility']).data;
  const context = useAuthorizationContext();
  if (!facility) return <p className="text-sm text-ink-muted">Reading facility details…</p>;
  // The server lets only a facility administrator change these.
  if (!(context.role === 'facility_admin' || context.roles?.includes('facility_admin'))) return <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-ink-muted">Facility</dt><dd className="font-bold">{facility.name}</dd></div><div><dt className="text-ink-muted">Facility code</dt><dd className="font-mono font-bold">{facility.code}</dd></div></dl>;
  return <div className="space-y-5">
    <DetailsForm facility={facility} />
    {facility.timeZone ? <FacilitySettings /> : null}
  </div>;
};
