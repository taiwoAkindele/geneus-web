import type { FacilityDetails } from '@shared';
import { SegmentedControl, TextField } from '@/ui';

/** Identical details and level choices for the first facility and subsequent facilities. */
export const FacilityDetailsFields = ({ value, onChange, disabled, errors = {} }: {
  value: FacilityDetails;
  onChange: (patch: Partial<FacilityDetails>) => void;
  disabled?: boolean;
  errors?: Partial<Record<keyof FacilityDetails, string>>;
}) => <fieldset disabled={disabled} className="space-y-4">
  <TextField label="Facility name" placeholder="e.g. Sunrise Hospital, Lekki" name="facility_name" required value={value.name} error={errors.name} onChange={(event) => onChange({ name: event.target.value })} />
  <TextField label="Facility code" hint="Used to build every Patient ID — short and permanent." placeholder="e.g. SUN-LEKKI" name="facility_code" required value={value.code} error={errors.code} onChange={(event) => onChange({ code: event.target.value.toUpperCase() })} />
  <div className="flex gap-3">
    <div className="min-w-0 flex-1"><TextField label="State" placeholder="e.g. Lagos" name="facility_state" required value={value.state} error={errors.state} onChange={(event) => onChange({ state: event.target.value })} /></div>
    <div className="min-w-0 flex-1"><TextField label="LGA" placeholder="e.g. Eti-Osa" name="facility_lga" required value={value.lga} error={errors.lga} onChange={(event) => onChange({ lga: event.target.value })} /></div>
  </div>
  <div><div className="mb-2 text-[13px] font-semibold text-ink-soft">Level of care</div><SegmentedControl ariaLabel="Level of care" value={value.level} onChange={(level) => onChange({ level })} options={[
    { value: 'phc', label: 'Primary' }, { value: 'general_hospital', label: 'Secondary' }, { value: 'teaching_hospital', label: 'Tertiary' },
  ]} />{errors.level ? <p className="mt-2 text-sm text-danger">{errors.level}</p> : null}</div>
</fieldset>;
