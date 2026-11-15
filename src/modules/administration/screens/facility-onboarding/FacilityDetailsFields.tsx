import type { FacilityDetails } from '@shared';
import type { ReactNode } from 'react';
import { SelectField, TextField } from '@/ui';

/** Identical details and level choices for the first facility and subsequent facilities. */
export const FacilityDetailsFields = ({ value, onChange, disabled, errors = {}, codeLocked = false, countryField }: {
  value: FacilityDetails;
  onChange: (patch: Partial<FacilityDetails>) => void;
  disabled?: boolean;
  errors?: Partial<Record<keyof FacilityDetails, string>>;
  /** An existing facility: its code is its permanent identity and is shown, not edited. */
  codeLocked?: boolean;
  countryField?: ReactNode;
}) => <fieldset disabled={disabled} className="space-y-4">
  <TextField label="Facility name" placeholder="e.g. Sunrise Hospital, Lekki" name="facility_name" required value={value.name} error={errors.name} onChange={(event) => onChange({ name: event.target.value })} />
  {codeLocked ? <div><p className="text-[13px] font-semibold text-ink-soft">Facility code</p><p className="mt-1 font-mono font-bold">{value.code}</p><p className="text-xs text-ink-muted">Permanent: every Patient ID is built from it.</p></div> : <TextField label="Facility code" hint="Used to build every Patient ID — short and permanent." placeholder="e.g. SUN-LEKKI" name="facility_code" required value={value.code} error={errors.code} onChange={(event) => onChange({ code: event.target.value.toUpperCase() })} />}
  {countryField}
  <div className="flex gap-3">
    <div className="min-w-0 flex-1"><TextField label="State" placeholder="e.g. Lagos" name="facility_state" required value={value.state} error={errors.state} onChange={(event) => onChange({ state: event.target.value })} /></div>
    <div className="min-w-0 flex-1"><TextField label="LGA" placeholder="e.g. Eti-Osa" name="facility_lga" required value={value.lga} error={errors.lga} onChange={(event) => onChange({ lga: event.target.value })} /></div>
  </div>
  <SelectField label="Level of care" name="facility_level" value={value.level} onChange={(event) => onChange({ level: event.target.value as FacilityDetails['level'] })} error={errors.level} options={[
    { value: 'phc', label: 'Primary' }, { value: 'general_hospital', label: 'Secondary' }, { value: 'teaching_hospital', label: 'Tertiary' },
    { value: 'chc', label: 'Community health centre' }, { value: 'specialist', label: 'Specialist' },
  ]} />
</fieldset>;
