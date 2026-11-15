import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AnyDocument, ServiceOffering } from '@shared';
import { Button, Icon, SelectField, Sheet, SheetCancelButton, Tag, TextField, useToast } from '@/ui';
import { useAuthorizationContext } from '@/session';
import type { WorkforceData } from '@/data/repos/workforce';
import { RecordEditor } from '@/modules/operations/workforce/RecordEditor';
import { WorkspaceLoading } from '@/modules/operations/workforce/Workspaces';
import { useWorkforce } from '@/modules/operations/workforce/useWorkforce';
import { humanize } from '@/modules/operations/workforce/presentation';
import { StaffVerification, useStaffVerification } from '@/modules/insurance/StaffVerification';
import {
  addCareService, CARE_SERVICE_PRESETS, carePlaces, careServiceStatus, CATEGORY_LABELS, CUSTOM_CATEGORIES, defaultPlacement,
  existingCareService, routableTeams, type CareCategory, type CarePreset,
} from './careServices';
import { careServiceOfferings } from './setupProgress';

const INTAKE: { value: ServiceOffering['intakePolicy']; label: string }[] = [
  { value: 'both', label: 'Walk-in and booked' }, { value: 'walk_in', label: 'Walk-in only' }, { value: 'scheduled', label: 'Booked only' },
];
const intakeLabel = (value: string) => INTAKE.find((i) => i.value === value)?.label ?? humanize(value);

/** Choose the team and place, with the name and category asked only for a custom service. */
const AddCareServiceSheet = ({ preset, data, onClose, onSaved }: { preset?: CarePreset; data: WorkforceData; onClose: () => void; onSaved: () => void }) => {
  const context = useAuthorizationContext(), toast = useToast();
  const start = defaultPlacement(preset, data);
  const [name, setName] = useState(preset?.name ?? ''), [category, setCategory] = useState<CareCategory>(preset?.category ?? 'consultation');
  const [intakePolicy, setIntake] = useState<ServiceOffering['intakePolicy']>(preset?.intakePolicy ?? 'both');
  const [unitId, setUnit] = useState(start.unitId), [locationId, setLocation] = useState(start.locationId);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  // Configuration is saved on the server in the person's name; the wizard sits outside Settings, so confirm here.
  const { verified } = useStaffVerification();
  const teams = routableTeams(data.units), places = carePlaces(data.locations);
  const save = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await addCareService({ key: preset?.key, name, category, intakePolicy, unitId, locationId }, data, context);
      toast(`${name.trim()} added`);
      onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The care service could not be added'); } finally { setBusy(false); }
  };
  return <Sheet title={preset ? `Add ${preset.name}` : 'Add a care service'} eyebrow="Care services" onClose={onClose} closeDisabled={busy}>
    <div className="space-y-4">
      {preset ? <p className="text-sm text-ink-muted">{preset.description}</p> : <>
        <TextField label="Name" name="care_service_name" value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Eye clinic" />
        <SelectField label="Kind of care" name="care_service_category" value={category} onChange={(e) => setCategory(e.target.value as CareCategory)} options={CUSTOM_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} />
        <SelectField label="Patients accepted" name="care_service_intake" value={intakePolicy} onChange={(e) => setIntake(e.target.value as ServiceOffering['intakePolicy'])} options={INTAKE} />
      </>}
      {teams.length ? <SelectField label="Responsible team" name="care_service_team" value={unitId} onChange={(e) => setUnit(e.target.value)} options={teams.map((t) => ({ value: t.id, label: t.name }))} />
        : <p className="rounded-field border border-amber-border bg-amber-bg p-3 text-sm text-amber-text">Add a team first. <Link className="font-bold underline" to="/setup?step=teams">Go to Teams & units</Link></p>}
      {places.length ? <SelectField label="Where it happens" name="care_service_place" value={locationId} onChange={(e) => setLocation(e.target.value)} options={places.map((l) => ({ value: l.id, label: `${l.name} · ${humanize(l.kind)}` }))} />
        : <p className="rounded-field border border-amber-border bg-amber-bg p-3 text-sm text-amber-text">Add a place first. <Link className="font-bold underline" to="/setup?step=places">Go to Places & beds</Link></p>}
      <p className="text-xs text-ink-muted">Staff assignments, opening hours and other details can be added later from the service.</p>
      <StaffVerification purpose="Adding a care service" />
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <Button loading={busy} disabled={busy || !verified || !teams.length || !places.length} onClick={save}>Add care service</Button>
      <SheetCancelButton>Cancel</SheetCancelButton>
    </div>
  </Sheet>;
};

/**
 * Step 4: the broad kinds of care the hospital provides. Lab tests are offerings
 * too but are kept in the Lab catalogue, so they never appear or count here.
 */
export const CareServicesStep = () => {
  const context = useAuthorizationContext();
  const query = useWorkforce();
  const [adding, setAdding] = useState<{ preset?: CarePreset }>();
  const [editing, setEditing] = useState<AnyDocument>();
  if (query.loading || query.error || !query.data) return <WorkspaceLoading error={query.error} reload={query.reload} />;
  const data = query.data;
  const allowed = context.permissions.includes('service:manage');
  const services = careServiceOfferings(data.offerings, data.definitions).sort((a, b) => a.name.localeCompare(b.name));
  const categoryOf = (o: ServiceOffering): CareCategory => data.definitions.find((d) => d.id === o.serviceDefinitionId)?.category ?? 'other';
  const groups = (Object.keys(CATEGORY_LABELS) as CareCategory[]).map((c) => ({ category: c, items: services.filter((o) => categoryOf(o) === c) })).filter((g) => g.items.length);
  const place = (o: ServiceOffering) => o.locationIds.map((id) => data.locations.find((l) => l.id === id)?.name).filter(Boolean).join(', ');
  const team = (o: ServiceOffering) => data.units.find((u) => u.id === o.unitId || u.unitId === o.unitId)?.name;
  const available = CARE_SERVICE_PRESETS.filter((p) => !existingCareService(p, data));

  return <div className="space-y-5">
    <section aria-labelledby="care-services-list" className="space-y-3">
      <h3 id="care-services-list" className="font-bold">Your care services</h3>
      {groups.length ? groups.map((group) => <div key={group.category}>
        <h4 className="text-xs font-bold uppercase tracking-wide text-ink-muted">{CATEGORY_LABELS[group.category]}</h4>
        <ul className="mt-1 divide-y divide-outline-soft rounded-field border border-outline-soft">{group.items.map((o) => {
          const status = careServiceStatus(o, data);
          return <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0"><p className="font-bold">{o.name}</p><p className="text-xs text-ink-muted">{[team(o), place(o), intakeLabel(o.intakePolicy)].filter(Boolean).join(' · ')}</p></div>
            <div className="flex items-center gap-2"><Tag tone={status.tone}>{status.label}</Tag>
              {allowed ? <Button fullWidth={false} variant="outlined" disabled={data.pending.has(o.id)} onClick={() => setEditing(o)}>Edit</Button> : null}</div>
          </li>;
        })}</ul>
      </div>) : <p className="rounded-field border border-dashed border-outline p-4 text-sm text-ink-muted">No care services yet. Choose the kinds of care this hospital provides below.</p>}
    </section>

    {allowed ? <section aria-labelledby="care-services-add" className="space-y-3">
      <h3 id="care-services-add" className="font-bold">Add care services</h3>
      {available.length ? <ul className="grid gap-2 sm:grid-cols-2">{available.map((p) => <li key={p.key}>
        <button type="button" onClick={() => setAdding({ preset: p })} className="flex min-h-[56px] w-full items-center justify-between gap-3 rounded-field border border-outline-soft p-3 text-left hover:border-brand">
          <span><span className="block text-sm font-bold">{p.name}</span><span className="block text-xs text-ink-muted">{p.description}</span></span>
          <Icon name="plus" className="h-4 w-4 shrink-0 text-brand" />
        </button></li>)}</ul> : <p className="text-sm text-ink-muted">All the common care services are added.</p>}
      <Button fullWidth={false} variant="outlined" onClick={() => setAdding({})}><Icon name="plus" className="h-4 w-4" />Add a custom care service</Button>
    </section> : <p className="text-sm text-ink-muted">Your role can view these but not change them.</p>}

    <p className="text-sm text-ink-muted">Lab tests, medicines and other catalogue items are set up in their own areas. See “When you need them”.</p>
    {adding ? <AddCareServiceSheet preset={adding.preset} data={data} onClose={() => setAdding(undefined)} onSaved={query.reload} /> : null}
    {editing ? <RecordEditor key={editing.id} kind="service_offering" previous={editing} data={data} onClose={() => setEditing(undefined)} onSaved={query.reload} /> : null}
  </div>;
};
