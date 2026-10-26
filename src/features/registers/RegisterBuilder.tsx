import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerDefinitionIssues } from '@shared';
import { useAuthorizationContext } from '@/session';
import { discardRegisterRecovery, readRegisterRecovery, writeRegisterRecovery, type RegisterRecovery } from '@/data/repos/registerDrafts';
import { Button, SectionTabs, SelectField, Sheet, SheetCancelButton, TextAreaField, TextField, ToggleSwitch, useToast } from '@/ui';
import { CATEGORIES, FIELD_TYPES, isChoice, typeDef, uid } from './constants';
import { RegisterField } from './RegisterField';
import { useRegisters } from './RegistersProvider';
import type { RegisterDraft, RegisterField as Field, FieldType } from './types';

const emptyDraft = (): RegisterDraft => ({ name: '', category: 'General', description: '', fields: [] });
const toDraft = (value: RegisterDraft): RegisterDraft => ({ name: value.name, category: value.category, description: value.description, fields: value.fields });
const newField = (type: FieldType, label = ''): Field => ({ id: uid('field'), type, label, required: false, help: '', ...(isChoice(type) ? { options: ['Option 1', 'Option 2'] } : {}) });

export const RegisterBuilder = ({ registerId }: { registerId?: string }) => {
  const query = useRegisters(), context = useAuthorizationContext(), navigate = useNavigate(), toast = useToast();
  const register = registerId ? query.getById(registerId) : undefined;
  const canConfigure = context.permissions.includes('register_definition:publish'), key = registerId ?? 'new';
  const [draft, setDraft] = useState<RegisterDraft>(emptyDraft), [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<'fields' | 'preview'>('fields'), [error, setError] = useState(''), [recoveryError, setRecoveryError] = useState('');
  const [recovered, setRecovered] = useState(false), [competing, setCompeting] = useState<RegisterRecovery>();
  const [recoverySaved, setRecoverySaved] = useState(''), [savedVersion, setSavedVersion] = useState<number>();
  const [publishing, setPublishing] = useState(false), [saving, setSaving] = useState(false), [removed, setRemoved] = useState<{ field: Field; index: number }>();
  const baseVersion = useRef(0), baseline = useRef(''), initialized = useRef(false), lock = useRef(false), suppressRecovery = useRef(false);
  const writes = useRef<Promise<void>>(Promise.resolve()), alive = useRef(true), errorHeading = useRef<HTMLParagraphElement>(null);
  const encoded = JSON.stringify(draft), dirty = loaded && encoded !== baseline.current;
  useEffect(() => { document.title = 'Register configuration · Geneus Health'; alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { if (error) errorHeading.current?.focus(); }, [error]);
  useEffect(() => {
    if (!canConfigure || initialized.current || query.loading || query.error || (registerId && !register)) return;
    let cancelled = false;
    const load = async () => {
      try {
        const initial = register ? toDraft(register.configuration) : emptyDraft();
        const version = register?.configuration.version ?? 0;
        const recovery = await readRegisterRecovery(context, key);
        if (cancelled) return;
        baseline.current = JSON.stringify(initial); baseVersion.current = version;
        if (recovery && recovery.baseVersion !== version) { setCompeting(recovery); setDraft(initial); }
        else { setDraft(recovery ? toDraft(recovery) : initial); setRecovered(Boolean(recovery)); }
        initialized.current = true; setLoaded(true);
      } catch (cause) { if (!cancelled) setError(cause instanceof Error ? cause.message : 'Register work could not be read.'); }
    };
    void load(); return () => { cancelled = true; };
  }, [canConfigure, context, key, query.loading, query.error, register, registerId]);
  useEffect(() => {
    if (!loaded || !dirty || suppressRecovery.current || competing) return;
    const snapshot = draft, signature = encoded, version = baseVersion.current;
    writes.current = writes.current.catch(() => {}).then(() => writeRegisterRecovery(context, key, snapshot, version));
    void writes.current.then(() => { if (alive.current) { setRecoverySaved(signature); setRecoveryError(''); } }).catch(() => { if (alive.current) setRecoveryError('Private recovery could not be saved. Save a draft before leaving this page.'); });
  }, [context, key, loaded, dirty, encoded, competing]);
  useEffect(() => {
    if (!dirty || (recoverySaved === encoded && !saving)) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, encoded, recoverySaved, saving]);
  const fieldKeys = useRef(new Map<string, string>());
  const updateField = (id: string, patch: Partial<Field>) => {
    const field = draft.fields.find((candidate) => candidate.id === id);
    const changedType = Boolean(patch.type && field && patch.type !== field.type);
    const replacementId = changedType ? uid('field') : id;
    if (changedType) fieldKeys.current.set(replacementId, fieldKeys.current.get(id) ?? id);
    setDraft((current) => ({ ...current, fields: current.fields.map((candidate) => candidate.id === id ? { ...candidate, ...patch, ...(changedType ? { id: replacementId, options: isChoice(patch.type!) ? ['Option 1', 'Option 2'] : undefined } : {}) } : candidate) }));
  };
  const move = (index: number, direction: number) => setDraft((current) => { const fields = [...current.fields], target = index + direction; if (target < 0 || target >= fields.length) return current; [fields[index], fields[target]] = [fields[target], fields[index]]; return { ...current, fields }; });
  const review = () => {
    const issues = registerDefinitionIssues({ ...draft, status: 'published' }, register ? [register.configuration] : []);
    if (issues.length) { setError(issues.join(' ')); setTab('fields'); return; }
    setError(''); setPublishing(true);
  };
  const save = async (publish: boolean) => {
    if (lock.current || competing) return;
    lock.current = true; setSaving(true); setError('');
    try {
      await writes.current.catch(() => {});
      const definition = await (publish ? query.publish : query.saveDraft)(draft, registerId ?? null, baseVersion.current);
      suppressRecovery.current = true;
      await discardRegisterRecovery(context, key).catch(() => setRecoveryError('The shared draft was saved, but private recovery could not be cleared.'));
      baseline.current = encoded; baseVersion.current = definition.version; setSavedVersion(definition.version); setPublishing(false);
      query.reload(); toast(publish ? 'Register published on this device. Staff can record entries.' : 'Register draft saved on this device. It will sync when connected.');
      if (publish) navigate('/registers');
      else if (!registerId) navigate(`/registers/${encodeURIComponent(definition.registerId)}/configure`, { replace: true });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The register could not be saved. Your work is still here.'); }
    finally { lock.current = false; setSaving(false); suppressRecovery.current = false; }
  };
  const template = () => setDraft((current) => ({ ...current, name: current.name || 'Daily service log', fields: [newField('text', 'Patient ID (optional)'), { ...newField('select', 'Service provided'), options: ['Consultation', 'Follow-up', 'Other'], required: true }, newField('textarea', 'Notes')] }));
  const resolveRecovery = async (resume: boolean) => {
    if (!competing) return;
    if (resume) { setDraft(toDraft(competing)); setRecovered(true); }
    else { await discardRegisterRecovery(context, key); setRecoverySaved(encoded); }
    setCompeting(undefined);
  };
  if (!canConfigure) return <div className="p-5"><h1 className="text-2xl font-extrabold">Register configuration</h1><p className="mt-3">Your account does not have register configuration permission.</p><Link className="mt-3 inline-flex min-h-[44px] items-center font-bold text-brand" to="/registers">Open registers</Link></div>;
  if (query.error || (!loaded && error)) return <div role="alert" className="p-5"><p>{error || 'Register definitions could not be read.'}</p><Button onClick={() => { setError(''); query.reload(); }}>Try again</Button></div>;
  if (!loaded) return <div className="p-5"><h1 className="text-2xl font-extrabold">Register configuration</h1>{registerId && !query.loading && !register ? <p role="alert">This register is not available on this device. <Link to="/registers" className="font-bold text-brand">Open registers</Link></p> : <p role="status" className="mt-4">Reading register work…</p>}</div>;
  return <div className="mx-auto max-w-5xl space-y-5 px-4 py-5 pb-40 md:px-7 md:pb-8"><Link to="/registers" className="inline-flex min-h-[44px] items-center font-bold text-brand">All registers</Link><header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-[28px] font-extrabold">{registerId ? 'Configure register' : 'Create register'}</h1><p className="mt-1 text-sm text-ink-soft">Build a form, save a draft, then review and publish it for staff.</p></div><div className="hidden flex-wrap gap-2 md:flex"><Button variant="outlined" fullWidth={false} disabled={saving || Boolean(competing)} loading={saving && !publishing} onClick={() => void save(false)}>Save draft</Button><Button fullWidth={false} disabled={saving || Boolean(competing)} onClick={review}>Review &amp; publish</Button></div></header>
    <div role="status" className="rounded-field border border-outline-soft bg-white p-3 text-sm text-ink-soft">{dirty ? recoverySaved === encoded ? 'Unsaved changes · private recovery saved on this device.' : 'Saving private recovery…' : savedVersion ? `Draft version ${savedVersion} saved. It will sync when connected.` : register?.hasDraft ? `Resuming saved draft version ${register.configuration.version}.` : register ? `Published version ${register.version}. Changes will create a new version.` : 'New register. Save a draft to share it with other authorized staff.'}{recovered ? <span className="mt-1 block font-semibold">Recovered your unfinished work from this device.</span> : null}</div>
    {recoveryError ? <p role="alert" className="text-sm text-danger">{recoveryError}</p> : null}{error ? <p ref={errorHeading} role="alert" tabIndex={-1} className="rounded-field border border-danger p-3 text-sm text-danger">{error}</p> : null}
    {competing ? <div className="space-y-3 rounded-field border border-amber-border bg-amber-bg p-4 text-sm"><p className="font-bold">A newer register version is available.</p><p>Your private work began on version {competing.baseVersion}. The current configuration is version {baseVersion.current}. Choose which to open; publishing still creates a new version.</p><div className="flex flex-wrap gap-2"><Button fullWidth={false} onClick={() => void resolveRecovery(true).catch(() => setRecoveryError('Could not restore this recovery.'))}>Resume my work for review</Button><Button variant="outlined" fullWidth={false} onClick={() => void resolveRecovery(false).catch(() => setRecoveryError('Could not clear this recovery.'))}>Use current configuration</Button></div></div> : null}
    <SectionTabs label="Register configuration sections" value={tab} onChange={setTab} options={[{ value: 'fields', label: 'Build form' }, { value: 'preview', label: 'Preview' }]} />
    {tab === 'preview' ? <section className="mx-auto max-w-xl space-y-4 rounded-card border border-outline-soft bg-white p-5"><div><h2 className="text-xl font-extrabold">{draft.name || 'Untitled register'}</h2><p className="mt-1 text-sm text-ink-soft">{draft.description || 'Preview of the entry form staff will see.'}</p></div>{draft.fields.length ? draft.fields.map((field) => <RegisterField key={field.id} field={{ ...field, label: field.label || 'Untitled field' }} preview />) : <p className="text-sm text-ink-muted">Add questions in Build form to preview them here.</p>}<p className="text-xs text-ink-muted">Preview only. No entry is being recorded.</p></section> : <div className="space-y-5"><section className="space-y-4 rounded-card border border-outline-soft bg-white p-4"><div className="grid gap-4 md:grid-cols-2"><TextField label="Register name" name="register_name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /><SelectField label="Category" value={draft.category} options={[...(!CATEGORIES.includes(draft.category) ? [{ value: draft.category, label: draft.category }] : []), ...CATEGORIES.map((category) => ({ value: category, label: category }))]} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} /></div><TextAreaField label="Description and instructions" rows={2} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></section>
      {!draft.fields.length ? <section className="space-y-3 rounded-card border border-dashed border-outline bg-white p-5"><h2 className="font-extrabold">Start your register</h2><p className="text-sm text-ink-soft">Use the service log starter or add your own questions below. Starters are editable forms, not national reporting templates.</p><Button variant="outlined" fullWidth={false} onClick={template}>Use service log starter</Button></section> : null}
      {removed ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-field border border-outline p-3 text-sm"><span>Removed “{removed.field.label || 'Untitled field'}” from this draft. Earlier entries stay intact.</span><Button variant="ghost" fullWidth={false} onClick={() => { setDraft((current) => { const fields = [...current.fields]; fields.splice(removed.index, 0, removed.field); return { ...current, fields }; }); setRemoved(undefined); }}>Undo removal</Button></div> : null}
      {draft.fields.map((field, index) => <fieldset key={fieldKeys.current.get(field.id) ?? field.id} className="space-y-3 rounded-card border border-outline-soft bg-white p-4"><legend className="px-2 text-sm font-bold text-brand">{field.type === 'section' ? 'Section' : 'Question'} {index + 1}</legend><div className="grid gap-3 md:grid-cols-2"><TextField label={`Label for field ${index + 1}`} value={field.label} onChange={(event) => updateField(field.id, { label: event.target.value })} /><SelectField label={`Type for field ${index + 1}`} value={field.type} options={FIELD_TYPES.map((item) => ({ value: item.type, label: item.label }))} onChange={(event) => updateField(field.id, { type: event.target.value as FieldType })} /></div>{field.type !== 'section' ? <><div className="flex min-h-[44px] items-center gap-3"><ToggleSwitch ariaLabel={`Require field ${index + 1}`} checked={field.required} onChange={(required) => updateField(field.id, { required })} /><span className="text-sm">Answer required</span></div><TextField label={`Help for field ${index + 1}`} value={field.help ?? ''} onChange={(event) => updateField(field.id, { help: event.target.value })} /></> : null}{isChoice(field.type) ? <TextAreaField label={`Choices for field ${index + 1}, one per line`} value={(field.options ?? []).join('\n')} onChange={(event) => updateField(field.id, { options: event.target.value.split('\n') })} /> : null}<div className="flex flex-wrap gap-2 border-t border-outline-soft pt-2"><Button variant="outlined" fullWidth={false} disabled={index === 0} onClick={() => move(index, -1)}>Move up</Button><Button variant="outlined" fullWidth={false} disabled={index === draft.fields.length - 1} onClick={() => move(index, 1)}>Move down</Button><Button variant="danger-outline" fullWidth={false} onClick={() => { setRemoved({ field, index }); setDraft((current) => ({ ...current, fields: current.fields.filter((item) => item.id !== field.id) })); }}>Remove field</Button></div></fieldset>)}
      <section className="space-y-3 rounded-card border border-outline-soft bg-white p-4"><h2 className="font-extrabold">Add a question or heading</h2><div className="flex flex-wrap gap-2">{FIELD_TYPES.map((field) => <Button key={field.type} variant="outlined" fullWidth={false} className="text-sm" onClick={() => setDraft((current) => ({ ...current, fields: [...current.fields, newField(field.type)] }))}>{field.label}</Button>)}</div></section></div>}
    <div className="fixed inset-x-0 bottom-[64px] z-20 flex gap-3 border-t border-outline-soft bg-white p-3 md:hidden"><div className="flex-1"><Button variant="outlined" disabled={saving || Boolean(competing)} onClick={() => void save(false)}>Save draft</Button></div><div className="flex-1"><Button disabled={saving || Boolean(competing)} onClick={review}>Review &amp; publish</Button></div></div>
    {publishing ? <Sheet title="Review register before publishing" eyebrow={draft.name} onClose={() => setPublishing(false)} closeDisabled={saving}><p className="text-sm text-ink-soft">Staff will record against this new published version. Existing entries retain their saved questions and answers. A saved draft does not replace the current staff form.</p><ul className="my-4 divide-y divide-outline-soft">{draft.fields.map((field) => <li key={field.id} className="py-3 text-sm"><strong>{field.label}</strong><span className="mt-1 block text-ink-muted">{typeDef(field.type).label}{field.required ? ' · Required' : ''}</span></li>)}</ul>{error ? <p role="alert" className="mb-3 text-sm text-danger">{error}</p> : null}<div className="space-y-3"><Button loading={saving} disabled={saving} onClick={() => void save(true)}>Confirm publication</Button><SheetCancelButton disabled={saving}>Keep editing</SheetCancelButton></div></Sheet> : null}
  </div>;
};
