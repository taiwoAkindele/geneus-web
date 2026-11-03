import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { RESULT_PART_KIND_LABELS, ResultTemplateDraft, type ResultPart, type ResultTemplate } from '@shared';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext } from '@/session';
import { loadResultTemplateSettings } from '@/data/repos/resultTemplates';
import { saveResultTemplate } from '@/data/repos/resultTemplates';
import { Banner, Button, SelectField, Sheet, SheetCancelButton, Tag, TextField, useToast } from '@/ui';
import { PartSheet } from '@/features/resultTemplates/PartSheet';
import { ResultPreview } from '@/features/resultTemplates/ResultPreview';
import { STATUS_LABELS, STATUS_TONES, partKeyFor, rangeSummary } from '@/features/resultTemplates/labels';

type Draft = { name: string; status: ResultTemplate['status']; parts: ResultPart[]; tests: string[] };
type Panel = { part?: number } | 'library' | 'tests' | 'discard';
const STATUSES = (['active', 'draft', 'archived'] as const).map((value) => ({ value, label: STATUS_LABELS[value] }));
/** Saving needs the server; say so plainly instead of a transport error. */
export const templateErrorText = (cause: unknown) => cause instanceof Error ? cause.message : 'Could not save';

/**
 * Create or edit one result template on a full page: its parts in order, which
 * tests use it, and a live preview of what the lab scientist will see. Saving
 * sends it to the server, which keeps every revision.
 */
export const ResultTemplateEditorScreen = () => {
  const { templateId } = useParams(), [params] = useSearchParams(), copyId = params.get('copy');
  const context = useAuthorizationContext(), navigate = useNavigate(), toast = useToast();
  const settings = useLiveQuery(useCallback(() => loadResultTemplateSettings(), [context.facilityId]));
  const existing = settings.data?.templates.find((t) => t.id === templateId);
  const [draft, setDraft] = useState<Draft>(), [initial, setInitial] = useState('');
  const [panel, setPanel] = useState<Panel>(), [busy, setBusy] = useState(false), [error, setError] = useState('');

  useEffect(() => {
    if (draft || !settings.data) return;
    const source = existing ?? settings.data.templates.find((t) => t.id === copyId);
    if (templateId && !existing) return;
    const start: Draft = existing ? { name: existing.name, status: existing.status, parts: existing.parts, tests: existing.serviceDefinitionIds }
      : source ? { name: `Copy of ${source.name}`, status: 'draft', parts: source.parts, tests: [] } : { name: '', status: 'draft', parts: [], tests: [] };
    setDraft(start); setInitial(JSON.stringify(start));
  }, [settings.data, existing, copyId, templateId, draft]);
  const dirty = Boolean(draft) && JSON.stringify(draft) !== initial;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => { document.title = `${existing?.name ?? 'New result template'} · Geneus Health`; }, [existing?.name]);

  // Tests already entered with another template in use cannot be added here.
  const claimed = useMemo(() => new Map((settings.data?.templates ?? []).filter((t) => t.id !== templateId && t.status === 'active').flatMap((t) => t.serviceDefinitionIds.map((id) => [id, t.name] as const))), [settings.data, templateId]);
  if (settings.loading && !settings.data) return <p role="status" className="p-6">Reading templates…</p>;
  if (templateId && settings.data && !existing) return <div className="space-y-3 p-6"><p>This template was not found on this device.</p><Link className="font-bold text-brand" to="/investigations/settings">Back to result templates</Link></div>;
  if (!draft || !settings.data) return null;
  const { lists, tests, parts: library } = settings.data;
  const update = (changes: Partial<Draft>) => setDraft({ ...draft, ...changes });
  const setPart = (index: number, part: ResultPart) => update({ parts: draft.parts.map((p, i) => i === index ? part : p) });
  const move = (index: number, by: number) => { const parts = [...draft.parts]; [parts[index], parts[index + by]] = [parts[index + by], parts[index]]; update({ parts }); };
  const editing = typeof panel === 'object' ? panel : undefined;

  const save = async () => {
    const candidate = ResultTemplateDraft.safeParse({ name: draft.name.trim(), status: draft.status, parts: draft.parts, serviceDefinitionIds: draft.status === 'active' ? draft.tests : [] });
    if (!candidate.success) { setError(candidate.error.issues[0]?.message ?? 'Check the template and try again'); return; }
    setBusy(true); setError('');
    try {
      await saveResultTemplate(candidate.data, context, existing);
      setInitial(JSON.stringify(draft));
      toast(`${candidate.data.name} saved`);
      navigate('/investigations/settings');
    } catch (cause) { setError(templateErrorText(cause)); } finally { setBusy(false); }
  };

  return <div className="min-h-screen space-y-5 bg-white px-4 py-5 md:px-8">
    <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-ink-soft"><Link className="font-bold text-brand" to="/investigations/catalogue">Investigation catalogue</Link><span aria-hidden="true">›</span><Link className="font-bold text-brand" to="/investigations/settings">Settings</Link><span aria-hidden="true">›</span><span>{existing?.name ?? 'New template'}</span></nav>
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3"><h1 className="text-[28px] font-extrabold">{existing ? existing.name : 'New result template'}</h1>{existing ? <Tag tone={STATUS_TONES[existing.status]}>{STATUS_LABELS[existing.status]}</Tag> : null}</div>
      <div className="flex flex-wrap gap-2"><Button variant="outlined" fullWidth={false} onClick={() => dirty ? setPanel('discard') : navigate('/investigations/settings')}>Cancel</Button><Button fullWidth={false} loading={busy} disabled={busy || !dirty} onClick={() => void save()}>Save template</Button></div>
    </header>
    {existing ? <Banner tone="info" title="Changes apply to results entered after you save">Results already published keep the version they were entered with.</Banner> : null}
    {error ? <p role="alert" className="text-danger-strong">{error}</p> : null}

    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0 space-y-6">
        <section aria-labelledby="details-heading" className="space-y-4 rounded-card border border-outline-soft p-5">
          <h2 id="details-heading" className="text-lg font-extrabold">Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Template name" value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder="For example Full blood count" />
            <SelectField label="Status" value={draft.status} options={STATUSES} onChange={(e) => update({ status: e.target.value as Draft['status'] })} />
          </div>
          <p className="text-sm text-ink-soft">Only a template that is in use can be linked to tests. A draft can be prepared and checked first.</p>
        </section>

        <section aria-labelledby="parts-heading" className="space-y-4 rounded-card border border-outline-soft p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="parts-heading" className="text-lg font-extrabold">Result parts</h2>
            <div className="flex flex-wrap gap-2">{library.some((p) => p.active) ? <Button variant="outlined" fullWidth={false} className="px-3 text-sm" onClick={() => setPanel('library')}>Add from parts library</Button> : null}<Button variant="outlined" fullWidth={false} className="px-3 text-sm" onClick={() => setPanel({})}>New part</Button></div>
          </div>
          {draft.parts.length ? <div className="relative overflow-x-auto rounded-field border border-outline-soft">
            <table className="w-full min-w-[600px] text-left text-sm">
              <caption className="sr-only">Result parts in order</caption>
              <thead className="bg-surface text-xs font-bold text-ink-soft"><tr><th scope="col" className="px-3 py-3"><span className="sr-only">Order</span></th><th scope="col" className="px-3 py-3">Part</th><th scope="col" className="px-3 py-3">Answer</th><th scope="col" className="px-3 py-3">Normal range</th><th scope="col" className="px-3 py-3">Required</th><th scope="col" className="px-3 py-3"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{draft.parts.map((part, index) => <tr key={part.key} className="border-t border-outline-soft align-middle">
                <td className="px-1 py-2"><div className="flex"><Button variant="ghost" fullWidth={false} className="w-11 px-0" aria-label={`Move ${part.label} up`} disabled={index === 0} onClick={() => move(index, -1)}>↑</Button><Button variant="ghost" fullWidth={false} className="w-11 px-0" aria-label={`Move ${part.label} down`} disabled={index === draft.parts.length - 1} onClick={() => move(index, 1)}>↓</Button></div></td>
                <td className="px-3 py-2"><p className="font-bold">{part.label}</p>{part.libraryPartId ? <Tag className="mt-1">Shared part</Tag> : null}</td>
                <td className="px-3 py-2">{RESULT_PART_KIND_LABELS[part.kind]}{part.kind === 'number' && part.unit ? <span className="block text-xs text-ink-soft">{part.unit}</span> : null}</td>
                <td className="px-3 py-2">{rangeSummary(part)}</td>
                <td className="px-3 py-2"><input type="checkbox" className="h-5 w-5 min-h-0 accent-brand" aria-label={`${part.label} required`} checked={part.required} onChange={(e) => setPart(index, { ...part, required: e.target.checked })} /></td>
                <td className="px-3 py-2"><div className="flex flex-nowrap justify-end gap-1">
                  {part.libraryPartId ? <Link className="inline-flex min-h-[44px] items-center px-2 text-sm font-bold text-brand" to="/investigations/settings?tab=parts">Edit in library</Link> : <Button variant="outlined" fullWidth={false} className="px-3 text-sm" onClick={() => setPanel({ part: index })}>Edit</Button>}
                  <Button variant="ghost" fullWidth={false} className="w-11 px-0" aria-label={`Remove ${part.label}`} onClick={() => update({ parts: draft.parts.filter((_, i) => i !== index) })}>✕</Button>
                </div></td>
              </tr>)}</tbody>
            </table>
          </div> : <p className="rounded-field border border-dashed border-outline p-4 text-sm">No parts yet. Add the values the lab records for this test, such as Haemoglobin or a Reactive / Non-reactive answer.</p>}
          {library.length ? <p className="text-sm text-ink-soft">A shared part is kept in the parts library. Changing it there updates every template that uses it.</p> : null}
        </section>

        <section aria-labelledby="tests-heading" className="space-y-3 rounded-card border border-outline-soft p-5">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="tests-heading" className="text-lg font-extrabold">Used by</h2><Button variant="outlined" fullWidth={false} className="px-3 text-sm" disabled={draft.status !== 'active'} onClick={() => setPanel('tests')}>Add tests</Button></div>
          {draft.status !== 'active' ? <p className="text-sm text-ink-soft">Set the status to In use to link tests.</p>
            : draft.tests.length ? <ul className="flex flex-wrap gap-2">{draft.tests.map((id) => { const test = tests.find((t) => t.id === id); return <li key={id} className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-outline-soft bg-brand-wash pl-3 text-sm font-semibold text-brand">{test?.name ?? 'Test no longer in the catalogue'}<Button variant="ghost" fullWidth={false} className="h-9 min-h-0 w-9 px-0" aria-label={`Stop using this template for ${test?.name ?? 'this test'}`} onClick={() => update({ tests: draft.tests.filter((t) => t !== id) })}>✕</Button></li>; })}</ul>
            : <p className="text-sm">No tests yet. Results for a test with no template are entered as text.</p>}
        </section>
      </div>

      <aside aria-labelledby="preview-heading" className="min-w-0 space-y-3 rounded-card border border-outline-soft p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="preview-heading" className="text-lg font-extrabold">Preview</h2><Tag>What the lab scientist sees</Tag></div>
        <ResultPreview name={draft.name} parts={draft.parts} />
      </aside>
    </div>

    {editing ? <PartSheet part={editing.part === undefined ? undefined : draft.parts[editing.part]} lists={lists} takenKeys={draft.parts.filter((_, i) => i !== editing.part).map((p) => p.key)} onClose={() => setPanel(undefined)}
      onSave={(part) => { update({ parts: editing.part === undefined ? [...draft.parts, part] : draft.parts.map((p, i) => i === editing.part ? part : p) }); setPanel(undefined); }} /> : null}
    {panel === 'library' ? <Sheet title="Add from parts library" placement="side" onClose={() => setPanel(undefined)}>
      <div className="space-y-2">
        <p className="text-sm text-ink-soft">Shared parts keep their unit, answers and normal ranges in the library.</p>
        <ul className="divide-y divide-outline-soft">{library.filter((p) => p.active).map((shared) => { const added = draft.parts.some((p) => p.libraryPartId === shared.id); return <li key={shared.id} className="flex items-center justify-between gap-3 py-2">
          <span className="text-sm"><b>{shared.part.label}</b><span className="block text-xs text-ink-soft">{RESULT_PART_KIND_LABELS[shared.part.kind]} · {rangeSummary(shared.part)}</span></span>
          <Button variant="outlined" fullWidth={false} className="px-3 text-sm" disabled={added} onClick={() => { update({ parts: [...draft.parts, { ...shared.part, key: partKeyFor(shared.part.label, draft.parts.map((p) => p.key)), required: true, libraryPartId: shared.id }] }); setPanel(undefined); }}>{added ? 'Added' : 'Add'}</Button>
        </li>; })}</ul>
        <SheetCancelButton>Done</SheetCancelButton>
      </div>
    </Sheet> : null}
    {panel === 'tests' ? <TestsSheet chosen={draft.tests} tests={tests} claimed={claimed} onClose={() => setPanel(undefined)} onSave={(chosen) => { update({ tests: chosen }); setPanel(undefined); }} /> : null}
    {panel === 'discard' ? <Sheet title="Discard your changes?" onClose={() => setPanel(undefined)}>
      <div className="space-y-4"><p>Your changes to this template have not been saved.</p><div className="flex flex-wrap gap-2"><SheetCancelButton>Keep editing</SheetCancelButton><Button variant="danger-outline" fullWidth={false} onClick={() => { setInitial(JSON.stringify(draft)); navigate('/investigations/settings'); }}>Discard changes</Button></div></div>
    </Sheet> : null}
  </div>;
};

const TestsSheet = ({ chosen, tests, claimed, onSave, onClose }: { chosen: string[]; tests: { id: string; name: string }[]; claimed: Map<string, string>; onSave: (chosen: string[]) => void; onClose: () => void }) => {
  const [picked, setPicked] = useState(new Set(chosen)), [query, setQuery] = useState('');
  const shown = tests.filter((test) => test.name.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id: string) => setPicked((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <Sheet title="Tests that use this template" placement="side" onClose={onClose} hasUnsavedChanges={picked.size !== chosen.length || chosen.some((id) => !picked.has(id))}>
    <div className="space-y-4">
      <TextField label="Search tests" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="space-y-1">{shown.map((test) => { const other = claimed.get(test.id); return <label key={test.id} className={`flex min-h-[44px] items-start gap-3 rounded-field px-2 py-2 ${other ? 'text-ink-muted' : 'hover:bg-surface'}`}>
        <input type="checkbox" className="mt-1 h-5 w-5 min-h-0 accent-brand" checked={picked.has(test.id)} disabled={Boolean(other)} onChange={() => toggle(test.id)} />
        <span className="text-sm"><b>{test.name}</b>{other ? <span className="block text-xs">Uses “{other}”</span> : null}</span>
      </label>; })}{shown.length ? null : <p className="text-sm">No tests match this search.</p>}</div>
      <div className="flex flex-wrap gap-2"><SheetCancelButton /><Button fullWidth={false} onClick={() => onSave(tests.filter((t) => picked.has(t.id)).map((t) => t.id))}>Use for {picked.size} {picked.size === 1 ? 'test' : 'tests'}</Button></div>
    </div>
  </Sheet>;
};
