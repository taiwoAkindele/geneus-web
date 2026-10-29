import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { currentFacilityRevisions, withReviewerAuthority, type AnyDocument } from '@shared';
import { Button, SelectField, Sheet, TextAreaField, TextField, useToast } from '@/ui';
import { useAuthorizationContext } from '@/session';
import { ownProof, saveWorkforce, saveWeeklyOccurrence, type WorkforceData } from '@/data/repos/workforce';
import { readWorkforceDraft, writeWorkforceDraft, clearWorkforceDraft } from '@/data/repos/workforceDrafts';
import { zonedInput, zonedInstant } from '@/lib/workforceTime';
import { editorFields, type EditorKind, type Values } from './editorFields';
import { humanize, recordName } from './presentation';
const text = (values: Values, key: string) => String(values[key] ?? '').trim();
const list = (values: Values, key: string) => Array.isArray(values[key]) ? values[key] as string[] : [];
const defaults = (kind: EditorKind, data: WorkforceData, record?: AnyDocument, preset?: Record<string, unknown>): Values => {
  const raw = { ...record, ...preset } as Record<string, unknown>;
  record = raw as AnyDocument;
  const zone = String(raw.timeZone || data.offerings.find((o) => o.id === raw.offeringId)?.timeZone || data.facility?.timeZone || 'Africa/Lagos');
  const values: Values = { active: true, kind: kind === 'unit' ? 'unit' : kind === 'credential' ? 'licence' : 'room', routingEnabled: true, serviceDefinitionId: 'new', category: 'consultation', delivery: 'physical', configuration: 'draft', intakePolicy: 'both', resourceReadiness: 'unassessed', duty: 'member', status: kind === 'service_session' ? 'draft' : 'proposed', verification: 'unverified', decision: 'approve', repeatCount: '1', scopeKind: 'offerings', timeZone: zone };
  for (const [key, value] of Object.entries(raw))
    if (typeof value === 'boolean' || typeof value === 'string')
      values[key] = value;
    else if (typeof value === 'number')
      values[key] = String(value);
    else if (Array.isArray(value) && value.every((v) => typeof v === 'string'))
      values[key] = value;
  for (const key of ['unitId', 'organizationUnitId', ...(kind === 'unit' ? ['parentId'] : [])])
    if (typeof raw[key] === 'string')
      values[key] = data.units.find((u) => u.id === raw[key] || u.unitId === raw[key])?.id || raw[key] as string;
  for (const key of ['startsAt', 'endsAt'])
    if (typeof raw[key] === 'string')
      values[key] = zonedInput(raw[key] as string, zone);
  if (record?.type === 'practitioner_profile') {
    values.professionCode = record.profession.code;
    values.professionLabel = record.profession.label;
    values.specialties = record.specialties.map((s) => s.label).join('\n');
  }
  if (record?.type === 'service_session') {
    values.participants = record.participants.map((p) => data.assignments.find((a) => a.assignmentId === p.assignmentId && a.staffId === p.staffId)?.id ?? '');
    for (const p of record.participants)
      values[`commitment:${p.assignmentId}`] = p.commitment;
    values.resources = record.resources.map((r) => r.locationId);
    for (const r of record.resources) {
      values[`mode:${r.locationId}`] = r.mode;
      values[`units:${r.locationId}`] = String(r.units);
    }
  }
  if (record?.type === 'capability_decision') {
    values.scopeKind = record.scope.kind;
    values.actions = record.scope.actions;
    values.offeringIds = record.scope.kind === 'offerings' ? record.scope.offeringIds : [];
  }
  if (record?.type === 'reviewer_delegation') {
    values.scopeKind = record.scopes.length === 1 ? record.scopes[0].kind : 'offerings';
    values.actions = [...new Set(record.scopes.flatMap((s) => s.actions))];
    values.offeringIds = [...new Set(record.scopes.flatMap((s) => s.kind === 'offerings' ? s.offeringIds : []))];
  }
  return values;
};
export const RecordEditor = ({ kind, data, previous, preset, privateRecords = [], onClose, onSaved }: {
  kind: EditorKind;
  data: WorkforceData;
  previous?: AnyDocument;
  preset?: Record<string, unknown>;
  privateRecords?: AnyDocument[];
  onClose: () => void;
  onSaved?: () => void;
}) => {
  const context = useAuthorizationContext(), toast = useToast();
  const [draftContext, setDraftContext] = useState(context), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [review, setReview] = useState(false), [error, setError] = useState('');
  const errorBox = useRef<HTMLDivElement>(null), definition = useRef<string>();
  const slot = `${kind}:${previous?.id || String(preset?.id || preset?.staffId || preset?.offeringId || 'new')}`;
  const { register, watch, reset, setValue, getValues, handleSubmit, formState: { errors, isDirty } } = useForm<Values>({ defaultValues: defaults(kind, data, previous, preset) });
  const values = watch(), fields = editorFields(kind, data, values, privateRecords).map((f)=>{
    if(kind==='credential'&&f.key==='verification'&&(!draftContext.permissions.includes('clinical_capability:review')||values.staffId===context.userId))return{...f,options:f.options?.filter((o)=>o.value==='unverified')};
    if(['capability_decision','reviewer_delegation'].includes(kind)&&f.key==='staffId')return{...f,options:f.options?.filter((o)=>o.value!==context.userId)};
    return f;
  });
  useEffect(() => {
    let alive = true;
    void (async () => {
      let actor = context;
      const worker = data.staff.find((s) => s.staffId === context.userId);
      if (worker)
        actor = withReviewerAuthority(context, worker, await ownProof(context, data), Date.now());
      const recovered = await readWorkforceDraft<Values>(actor, slot);
      if (alive) {
        setDraftContext(actor);
        if (recovered)
          reset(recovered);
        setReady(true);
      }
    })().catch((cause) => {
      if (alive) {
        setError(cause instanceof Error ? cause.message : 'Could not restore this draft');
        setReady(true);
      }
    });
    return () => { alive = false; };
  }, [context.userId, slot]);
  useEffect(() => {
    if (!ready || !isDirty)
      return; const timer = setTimeout(() => { void writeWorkforceDraft(draftContext, slot, getValues()).catch(() => setError('Draft recovery could not be saved. Keep this editor open until you save')); }, 400); return () => clearTimeout(timer);
  }, [values, ready, isDirty, draftContext, slot, getValues]);
  useEffect(() => {
    if (error)
      errorBox.current?.focus();
  }, [error]);
  useEffect(() => {
    if (kind === 'unit' && values.kind === 'department' && values.routingEnabled)
      setValue('routingEnabled', false);
  }, [kind, values.kind, values.routingEnabled, setValue]);
  const save = handleSubmit(async (form) => {
    if (busy)
      return;
    const consequential = ['capability_decision', 'reviewer_delegation'].includes(kind)||(kind==='credential'&&form.verification!=='unverified') || (kind === 'service_session' && form.status !== 'draft') || (kind === 'staff_assignment' && form.status !== 'proposed') || Boolean(previous && (form.active === false || form.configuration === 'retired' || text(form, 'parentId') !== String((previous as Record<string, unknown>).parentId ?? '')));
    if (consequential && !review) {
      setReview(true);
      setError('');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {};
      for (const field of fields) {
        const value = form[field.key];
        payload[field.key] = field.kind === 'multi' ? list(form, field.key) : field.kind === 'boolean' ? Boolean(value) : field.kind === 'number' ? (text(form, field.key) ? Number(value) : undefined) : text(form, field.key) || undefined;
      }
      for (const key of ['repeatCount', 'category', 'professionCode', 'professionLabel', 'specialties'])
        delete payload[key];
      const zone = text(form, 'timeZone') || data.offerings.find((o) => o.id === form.offeringId)?.timeZone || data.facility?.timeZone || 'Africa/Lagos';
      for (const key of ['startsAt', 'endsAt'])
        if (text(form, key))
          payload[key] = zonedInstant(text(form, key), zone, text(form, 'clockOccurrence') as 'earlier' | 'later' || 'reject');
      if (kind === 'service_definition')
        payload.concept = previous?.type === 'service_definition' ? previous.concept : { system: 'urn:geneus:local-service', code: crypto.randomUUID(), label: text(form, 'name') };
      if (kind === 'service_definition')
        payload.category = text(form, 'category');
      if (kind === 'service_offering' && form.serviceDefinitionId === 'new') {
        if (text(form, '_definitionName') === text(form, 'name'))
          definition.current = text(form, '_definitionId') || definition.current;
        else if (text(form, '_definitionName'))
          definition.current = undefined;
        if (!definition.current) {
          const created = await saveWorkforce('service_definition', { name: text(form, 'name'), category: text(form, 'category'), active: true, orderable: false, concept: { system: 'urn:geneus:local-service', code: crypto.randomUUID(), label: text(form, 'name') } }, context);
          definition.current = created.id;
          setValue('_definitionId', created.id);
          setValue('_definitionName', text(form, 'name'));
          await writeWorkforceDraft(draftContext, slot, getValues());
        }
        payload.serviceDefinitionId = definition.current;
      }
      if (kind === 'practitioner_profile') {
        payload.profession = previous?.type === 'practitioner_profile' && previous.profession.code === text(form, 'professionCode') ? { ...previous.profession, label: text(form, 'professionLabel') || previous.profession.label } : { system: 'urn:geneus:local-profession', code: text(form, 'professionCode'), label: form.professionCode === 'other' ? text(form, 'professionLabel') : humanize(text(form, 'professionCode')) };
        payload.specialties = text(form, 'specialties').split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((s) => previous?.type==='practitioner_profile'?previous.specialties.find((term)=>term.label===s)||{system:'urn:geneus:local-specialty',code:s.toLowerCase(),label:s}:{system:'urn:geneus:local-specialty',code:s.toLowerCase(),label:s});
      }
      if (kind === 'unit' && form.kind === 'department')
        payload.routingEnabled = false;
      if (kind === 'credential' && form.verification !== 'unverified') {
        payload.checkedBy = context.userId;
        payload.checkedOn = new Date().toISOString();
      }
      if (kind === 'capability_decision' || kind === 'reviewer_delegation') {
        const scope = form.scopeKind === 'facility' ? { kind: 'facility', actions: list(form, 'actions') } : { kind: 'offerings', offeringIds: list(form, 'offeringIds'), actions: list(form, 'actions') };
        delete payload.scopeKind;
        delete payload.offeringIds;
        delete payload.actions;
        if (kind === 'capability_decision')
          payload.scope = scope;
        else
          payload.scopes = previous?.type === 'reviewer_delegation' && (previous.scopes.length > 1 || form.decision === 'revoke') ? previous.scopes : [scope];
      }
      if (kind === 'service_session') {
        payload.participants = list(form, 'participants').map((id) => {
          const assignment = data.assignments.find((a) => a.id === id); if (!assignment)
            throw new Error('A selected assignment is no longer available'); return { assignmentId: assignment.assignmentId, staffId: assignment.staffId, commitment: text(form, `commitment:${assignment.assignmentId}`) || 'exclusive' };
        });
        payload.resources = list(form, 'resources').map((locationId) => ({ locationId, mode: text(form, `mode:${locationId}`) || 'exclusive', units: Number(text(form, `units:${locationId}`) || '1') }));
      }
      const repeats = kind === 'service_session' && !previous ? Number(form.repeatCount || 1) : 1;
      if (!Number.isInteger(repeats) || repeats < 1 || repeats > 12)
        throw new Error('Choose between one and twelve weekly occurrences');
      const seriesId = repeats > 1 ? text(form, '_seriesId') || crypto.randomUUID() : undefined;
      // Check every wall-clock occurrence before writing any part of a finite series.
      const occurrences=Array.from({length:repeats},(_,index)=>{
        const occurrence={...payload};
        if(seriesId){occurrence.seriesId=seriesId;for(const key of ['startsAt','endsAt']){
          const date=new Date(`${text(form,key)}:00Z`);date.setUTCDate(date.getUTCDate()+7*index);
          occurrence[key]=zonedInstant(date.toISOString().slice(0,16),zone,text(form,'clockOccurrence') as 'earlier'|'later'||'reject');
        }}return occurrence;
      });
      if (seriesId) {
        setValue('_seriesId', seriesId);
        await writeWorkforceDraft(draftContext, slot, getValues());
      }
      for (let index = 0; index < repeats; index++) {
        const occurrence = occurrences[index];
        if (seriesId)
          await saveWeeklyOccurrence(occurrence, context, seriesId, index);
        else
          await saveWorkforce(kind, occurrence, context, previous);
        if (seriesId) {
          setValue('_completedOccurrences', String(index + 1));
          await writeWorkforceDraft(draftContext, slot, getValues());
        }
      }
      await clearWorkforceDraft(draftContext, slot);
      toast('Saved on this device. Server acceptance will appear after sync');
      onSaved?.();
      onClose();
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save. Your entries remain here');
    }
    finally {
      setBusy(false);
    }
  }, () => { setError('Complete the highlighted fields before continuing'); });
  const selectedAssignments = currentFacilityRevisions(data.assignments).filter((a) => list(values, 'participants').includes(a.id));
  return <Sheet title={`${previous ? 'Update' : 'Add'} ${humanize(kind).toLowerCase()}`} eyebrow={previous ? recordName(previous) : 'Facility setup'} placement="side" onClose={onClose} closeDisabled={busy} hasUnsavedChanges={isDirty}>
    <p className="mb-4 text-sm text-ink-muted">{['credential', 'capability_decision', 'reviewer_delegation'].includes(kind) ? 'Private professional evidence. Qualification, approval and account access are separate.' : 'Save real services, places and duties. Changes remain proposals until the server accepts them.'}</p>
    {previous?.type === 'reviewer_delegation' && previous.scopes.length > 1 ? <p className="mb-4 text-sm text-ink-muted">This delegation has separate scope boundaries. They are retained exactly; update its term or revoke it. Create separate bounded delegations to change activities.</p> : null}
    {values._completedOccurrences ? <p role="status" className="mb-4 rounded-field bg-amber-bg p-3 text-sm">{String(values._completedOccurrences)} occurrences already saved. Confirming again resumes the same series; existing occurrences are not duplicated.</p> : null}
    {!ready ? <p role="status">Restoring your draft…</p> : <form onSubmit={save} noValidate className="space-y-4">
      {error ? <div ref={errorBox} tabIndex={-1} role="alert" className="rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger">{error}</div> : null}
      {review ? <div className="space-y-3"><h3 className="text-lg font-bold">Review before confirming</h3><dl className="space-y-3">{fields.map((f) => <div key={f.key}><dt className="text-xs font-bold text-ink-muted">{f.label}</dt><dd className="break-words text-sm">{f.kind === 'boolean' ? (values[f.key] ? 'Yes' : 'No') : f.kind === 'multi' ? list(values, f.key).map((id) => f.options?.find((o) => o.value === id)?.label || 'Unavailable selection').join(', ') || 'Not selected' : f.options?.find((o) => o.value === values[f.key])?.label || String(values[f.key] || 'Not set')}</dd></div>)}</dl><p className="rounded-field bg-amber-bg p-3 text-sm">This changes planned work or authority. Existing clinical records and responsibility remain until the required transitions are accepted.</p></div> : <fieldset disabled={busy || Boolean(values._completedOccurrences)} className="space-y-4">{fields.map((f) => {
        const message = errors[f.key] ? 'Complete this field' : undefined;
        const locked = (kind === 'practitioner_profile' && Boolean(previous) && f.key === 'staffId') || (previous?.type === 'reviewer_delegation' && previous.scopes.length > 1 && ['scopeKind', 'actions', 'offeringIds'].includes(f.key));
        if(kind==='practitioner_profile'&&previous?.type==='practitioner_profile'&&f.key==='staffId')return <div key={f.key}><span className="block text-sm font-bold">{f.label}</span><p className="my-2 text-sm">{data.staff.find((s)=>s.staffId===previous.staffId)?.fullName||'Original staff identity'}</p><input type="hidden" {...register(f.key)}/><p className="text-xs text-ink-muted">This profile stays with its original person.</p></div>;
        const props = { ...register(f.key, { required: !locked&&f.required && f.kind !== 'boolean' ? 'Required' : false }), disabled: locked, label: f.label, help: { purpose: f.help }, error: message };
        if (f.kind === 'multi')
          return <fieldset key={f.key} className="rounded-field border border-outline-soft p-3"><legend className="px-1 text-sm font-bold">{f.label}</legend><p className="mb-2 text-xs text-ink-muted">{f.help}</p>{f.options?.length ? f.options.map((o) => <label key={o.value} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" disabled={locked} value={o.value} {...register(f.key, { required: !locked&&f.required ? 'Choose at least one' : false })} className="h-4 w-4 accent-brand" />{o.label}</label>) : <p className="text-sm text-ink-muted">No eligible choices. Save the related records first.</p>}{message ? <p className="text-sm text-danger">{message}</p> : null}</fieldset>;
        if (f.kind === 'boolean')
          return <label key={f.key} className="block rounded-field border border-outline-soft p-3"><span className="flex min-h-11 items-center gap-3 font-bold"><input type="checkbox" {...register(f.key)} className="h-4 w-4 accent-brand" />{f.label}</span><span className="block text-xs text-ink-muted">{f.help}</span></label>;
        if (f.kind === 'select')
          return <SelectField key={f.key} {...props} options={[{ value: '', label: f.required ? 'Choose…' : 'None' }, ...(f.options || [])]} />;
        if (f.kind === 'textarea')
          return <TextAreaField key={f.key} {...props} />;
        return <TextField key={f.key} {...props} type={f.kind || 'text'} min={f.kind === 'number' ? 1 : undefined} />;
      })}
        {kind === 'service_session' ? <><h3 className="font-bold">Commitments and capacity</h3>{selectedAssignments.map((a) => <SelectField key={a.id} label={`${data.staff.find((s) => s.staffId === a.staffId)?.fullName} commitment`} {...register(`commitment:${a.assignmentId}`)} options={['exclusive', 'shared', 'on_call'].map((value) => ({ value, label: humanize(value) }))} />)}{list(values, 'resources').map((id) => <div key={id} className="space-y-2 rounded-field border border-outline-soft p-3"><p className="font-bold">{data.locations.find((l) => l.id === id)?.name}</p><SelectField label="Reservation type" {...register(`mode:${id}`)} options={[{ value: 'exclusive', label: 'Exclusive use' }, { value: 'pooled', label: 'Share a capacity pool' }]} /><TextField label="Capacity units" type="number" min="1" {...register(`units:${id}`)} /></div>)}</> : null}
        {fields.some((f) => f.kind === 'datetime-local') ? <SelectField label="Repeated daylight-saving clock time" help={{ purpose: 'Normally reject ambiguous times. If a time occurs twice, explicitly choose its earlier or later occurrence.' }} {...register('clockOccurrence')} options={[{ value: '', label: 'Ask me if ambiguous' }, { value: 'earlier', label: 'Earlier occurrence' }, { value: 'later', label: 'Later occurrence' }]} /> : null}
      </fieldset>}
      <div className="sticky bottom-0 space-y-2 border-t border-outline-soft bg-white py-3"><Button type="submit" loading={busy} disabled={busy}>{review ? 'Confirm and save' : 'Save / review changes'}</Button>{review ? <Button variant="outlined" disabled={busy} onClick={() => setReview(false)}>Back to details</Button> : null}<Button variant="ghost" disabled={busy} onClick={onClose}>Close editor</Button></div>
      {values._completedOccurrences?<details className="rounded-field border border-outline-soft p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">Stop remaining occurrences</summary><p className="my-3 text-sm text-ink-muted">Keep the {String(values._completedOccurrences)} sessions already saved and close only the unfinished series draft. Existing sessions remain available for review.</p><Button variant="outlined" disabled={busy} onClick={async()=>{setBusy(true);try{await clearWorkforceDraft(draftContext,slot);toast('Saved sessions kept. Remaining series draft closed');onClose();}catch(cause){setError(cause instanceof Error?cause.message:'The draft could not be closed');}finally{setBusy(false);}}}>Confirm stop remaining</Button></details>:null}
      <p className="text-xs text-ink-muted">Draft recovery is encrypted and belongs to your staff identity on this device.</p>
    </form>}
  </Sheet>;
};
