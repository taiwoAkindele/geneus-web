import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnswerListDraft, RESULT_PART_KIND_LABELS, templateResultType, type AnswerList, type ResultPartDefinition } from '@shared';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext } from '@/session';
import { loadAnswerListPage, loadPartPage, loadResultTemplateSettings, loadTemplatePage, type TemplateRow } from '@/data/repos/resultTemplates';
import { adoptStandardTemplates, loadStandardTemplates, saveAnswerList, saveResultPart } from '@/data/repos/resultTemplates';
import { ActionMenu, Button, DataTable, Icon, SectionTabs, SelectAllCheckbox, Sheet, SheetCancelButton, Tag, TextAreaField, TextField, type TableColumn } from '@/ui';
import { PartSheet } from '@/features/resultTemplates/PartSheet';
import { STATUS_LABELS, STATUS_TONES, rangeSummary } from '@/features/resultTemplates/labels';
import { templateErrorText } from './ResultTemplateEditorScreen';

type Tab = 'templates' | 'parts' | 'answers';
type Panel = 'standard' | 'copy' | { kind: 'part'; part?: ResultPartDefinition } | { kind: 'list'; list?: AnswerList };
const TABS = [{ value: 'templates', label: 'Result templates' }, { value: 'parts', label: 'Result parts library' }, { value: 'answers', label: 'Answer lists' }] as const;
const updated = (record: { updatedOn?: string; createdOn: string }) => new Date(record.updatedOn ?? record.createdOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const StandardTemplatesSheet = ({ onClose }: { onClose: () => void }) => {
  const context = useAuthorizationContext();
  const standards = useLiveQuery(useCallback(() => loadStandardTemplates(), [context.facilityId])), templates = standards.data;
  const [picked, setPicked] = useState<Set<string>>(new Set()), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<{ added: string[]; skipped: string[] }>();
  const [query, setQuery] = useState(''), needle = query.trim().toLowerCase();
  // Searches template names and the tests each serves; ticks are kept while the list is filtered.
  const shown = (templates ?? []).filter((t) => !needle || [t.name, ...t.testNames].some((text) => text.toLowerCase().includes(needle)));
  const toggle = (key: string) => setPicked((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const add = async () => {
    setBusy(true); setError('');
    try { setResult(await adoptStandardTemplates([...picked], context)); setPicked(new Set()); standards.reload(); }
    catch (cause) { setError(templateErrorText(cause)); } finally { setBusy(false); }
  };
  return <Sheet title="Start from a standard template" placement="side" onClose={onClose} hasUnsavedChanges={picked.size > 0}>
    <div className="space-y-4">
      <p className="text-sm">Common layouts with parts, units and answers filled in. Each is linked to the matching standard tests already in your catalogue. Normal ranges are typical adult values: check them against your laboratory's own before use. No children's ranges are included.</p>
      {standards.error ? <div role="alert" className="space-y-2"><p className="text-danger-strong">{standards.error.message}</p><Button variant="outlined" fullWidth={false} onClick={standards.reload}>Try again</Button></div>
        : !templates ? <p role="status">Reading standard templates…</p> : !templates.length ? <p role="status" className="rounded-field border border-dashed border-outline p-4 text-sm">The standard templates haven't reached this device yet. They arrive with its first sync after the update; until then you can start a blank template.</p>
        : <><TextField label="Search standard templates" type="search" value={query} placeholder="Template or test name" onChange={(e) => setQuery(e.target.value)} />
          {shown.length ? null : <p role="status" className="text-sm">No standard templates match this search.</p>}
          <SelectAllCheckbox keys={shown.filter((t) => !t.added).map((t) => t.key)} picked={picked} onChange={setPicked} />
          <div className="space-y-1">{shown.map((t) => <label key={t.key} className={`flex min-h-[44px] items-start gap-3 rounded-field px-2 py-2 ${t.added ? 'text-ink-muted' : 'hover:bg-surface'}`}>
          <input type="checkbox" className="mt-1 h-5 w-5 min-h-0 accent-brand" checked={picked.has(t.key)} disabled={t.added} onChange={() => toggle(t.key)} />
          <span className="text-sm"><b>{t.name}</b>{t.added ? <Tag className="ml-2">Already added</Tag> : null}<span className="block text-xs text-ink-soft">{t.parts.length} {t.parts.length === 1 ? 'part' : 'parts'}{t.testNames.length ? ` · For ${t.testNames.join(', ')}` : ' · For your own tests'}</span></span>
        </label>)}</div></>}
      {result ? <div role="status" className="space-y-1 rounded-field border border-outline-soft bg-brand-wash p-3 text-sm"><p className="font-bold">{result.added.length ? `Added ${result.added.length} ${result.added.length === 1 ? 'template' : 'templates'}.` : 'No new templates were added.'}</p>{result.skipped.length ? <p>Already added: {result.skipped.join(', ')}</p> : null}</div> : null}
      {error ? <p role="alert" className="text-danger-strong">{error}</p> : null}
      <div className="flex flex-wrap gap-2"><SheetCancelButton>{result ? 'Done' : 'Cancel'}</SheetCancelButton><Button fullWidth={false} loading={busy} disabled={busy || !picked.size} onClick={() => void add()}>Add {picked.size} selected</Button></div>
    </div>
  </Sheet>;
};

const CopySheet = ({ onClose }: { onClose: () => void }) => {
  const context = useAuthorizationContext(), navigate = useNavigate();
  const settings = useLiveQuery(useCallback(() => loadResultTemplateSettings(), [context.facilityId]));
  return <Sheet title="Copy one of your templates" placement="side" onClose={onClose}>
    <div className="space-y-2">
      <p className="text-sm text-ink-soft">The copy starts as a draft with the same parts. Choose the tests it is for before putting it in use.</p>
      {settings.data?.templates.length ? <ul className="divide-y divide-outline-soft">{settings.data.templates.map((t) => <li key={t.id} className="flex items-center justify-between gap-3 py-2">
        <span className="text-sm"><b>{t.name}</b><span className="block text-xs text-ink-soft">{templateResultType(t.parts)} · {t.parts.length} {t.parts.length === 1 ? 'part' : 'parts'}</span></span>
        <Button variant="outlined" fullWidth={false} className="px-3 text-sm" onClick={() => navigate(`/investigations/settings/templates/new?copy=${encodeURIComponent(t.id)}`)}>Copy</Button>
      </li>)}</ul> : <p className="text-sm">There are no templates to copy yet.</p>}
      <SheetCancelButton />
    </div>
  </Sheet>;
};

const AnswerListSheet = ({ list, onClose }: { list?: AnswerList; onClose: () => void }) => {
  const context = useAuthorizationContext();
  const [name, setName] = useState(list?.name ?? ''), [answers, setAnswers] = useState(list?.answers.join('\n') ?? ''), [active, setActive] = useState(list?.active ?? true);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const save = async () => {
    const draft = AnswerListDraft.safeParse({ name: name.trim(), answers: answers.split('\n').map((a) => a.trim()).filter(Boolean), active });
    if (!draft.success) { setError(draft.error.issues[0]?.message ?? 'Check the answer list'); return; }
    setBusy(true); setError('');
    try { await saveAnswerList(draft.data, context, list); onClose(); }
    catch (cause) { setError(templateErrorText(cause)); } finally { setBusy(false); }
  };
  return <Sheet title={list ? list.name : 'New answer list'} eyebrow={list ? 'Answer list' : undefined} placement="side" onClose={onClose} hasUnsavedChanges={name !== (list?.name ?? '') || answers !== (list?.answers.join('\n') ?? '')}>
    <div className="space-y-4">
      <TextField label="List name" value={name} onChange={(e) => setName(e.target.value)} placeholder="For example Reactive / Non-reactive" />
      <div className="space-y-1"><TextAreaField label="Answers" rows={6} value={answers} onChange={(e) => setAnswers(e.target.value)} /><p className="text-sm text-ink-soft">One answer per line. Saving a change updates every template and shared part that uses this list, as a new version.</p></div>
      {list ? <label className="flex min-h-[44px] items-center gap-3 text-sm font-bold"><input type="checkbox" className="h-5 w-5 min-h-0 accent-brand" checked={active} onChange={(e) => setActive(e.target.checked)} />Available to new parts</label> : null}
      {error ? <p role="alert" className="text-danger-strong">{error}</p> : null}
      <div className="flex flex-wrap gap-2"><SheetCancelButton /><Button fullWidth={false} loading={busy} disabled={busy || !name.trim()} onClick={() => void save()}>{list ? 'Save list' : 'Add list'}</Button></div>
    </div>
  </Sheet>;
};

/** A shared part is saved to the library on the server, which updates every template using it. */
const LibraryPartSheet = ({ shared, lists, onClose }: { shared?: ResultPartDefinition; lists: readonly AnswerList[]; onClose: () => void }) => {
  const context = useAuthorizationContext();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <PartSheet part={shared?.part} lists={lists} showRequired={false} saving={busy} error={error} onClose={onClose} onSave={(part) => {
    setBusy(true); setError('');
    saveResultPart({ part, active: shared?.active ?? true }, context, shared)
      .then(onClose).catch((cause) => setError(templateErrorText(cause))).finally(() => setBusy(false));
  }} />;
};

/**
 * Catalogue settings: the result templates the lab enters results with, the
 * shared parts library and answer lists. All three are changed on the server
 * while connected and read from this device's copy.
 */
export const CatalogueSettingsScreen = () => {
  const context = useAuthorizationContext(), navigate = useNavigate(), [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'templates') as Tab;
  const query = params.get('q') ?? '', page = Math.max(0, Number(params.get('page')) || 0);
  const set = (changes: Record<string, string>) => setParams((current) => { const next = new URLSearchParams(current); for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); } return next; }, { replace: true });
  const templates = useLiveQuery(useCallback(() => loadTemplatePage(context, { query, page }), [context.facilityId, query, page]));
  const parts = useLiveQuery(useCallback(() => loadPartPage(context, { query, page }), [context.facilityId, query, page]));
  const lists = useLiveQuery(useCallback(() => loadAnswerListPage(context, { query, page }), [context.facilityId, query, page]));
  const allLists = useLiveQuery(useCallback(() => loadResultTemplateSettings().then((s) => s.lists), [context.facilityId]));
  const [panel, setPanel] = useState<Panel>();
  useEffect(() => { document.title = 'Catalogue settings · Geneus Health'; }, []);
  const close = () => { setPanel(undefined); templates.reload(); parts.reload(); lists.reload(); allLists.reload(); };

  const templateColumns: TableColumn<TemplateRow>[] = [
    { key: 'name', label: 'Template', render: ({ template }) => <div className="min-w-[180px]"><Link className="font-bold text-brand" to={`/investigations/settings/templates/${encodeURIComponent(template.id)}`}>{template.name}</Link><p className="text-xs text-ink-soft">Updated {updated(template)}</p></div> },
    { key: 'type', label: 'Result type', className: 'hidden md:table-cell', render: ({ template }) => templateResultType(template.parts) },
    { key: 'parts', label: 'Parts', className: 'hidden md:table-cell', render: ({ template }) => template.parts.length },
    // One line, ending in "…" when long; the full list is the tooltip and is read in full by screen readers.
    { key: 'tests', label: 'Used by', render: ({ tests }) => tests.length ? <span className="block max-w-[320px] truncate" title={tests.join(', ')}>{tests.join(', ')}</span> : <span className="text-ink-soft">No tests yet</span> },
    { key: 'status', label: 'Status', render: ({ template }) => <Tag className="whitespace-nowrap" tone={STATUS_TONES[template.status]}>{STATUS_LABELS[template.status]}</Tag> },
    { key: 'actions', label: 'Action', render: ({ template }) => <Button variant="outlined" fullWidth={false} className="px-3 text-sm" onClick={() => navigate(`/investigations/settings/templates/${encodeURIComponent(template.id)}`)}>Edit</Button> },
  ];
  const partColumns: TableColumn<{ part: ResultPartDefinition; uses: number }>[] = [
    { key: 'name', label: 'Part', render: ({ part }) => <p className="font-bold">{part.part.label}{part.active ? null : <Tag className="ml-2">Not available</Tag>}</p> },
    { key: 'type', label: 'Answer', render: ({ part }) => RESULT_PART_KIND_LABELS[part.part.kind] },
    { key: 'unit', label: 'Unit', className: 'hidden md:table-cell', render: ({ part }) => part.part.kind === 'number' && part.part.unit ? part.part.unit : '—' },
    { key: 'range', label: 'Normal range', className: 'hidden md:table-cell', render: ({ part }) => rangeSummary(part.part) },
    { key: 'uses', label: 'Used in', render: ({ uses }) => `${uses} ${uses === 1 ? 'template' : 'templates'}` },
    { key: 'actions', label: 'Action', render: ({ part }) => <Button variant="outlined" fullWidth={false} className="px-3 text-sm" onClick={() => setPanel({ kind: 'part', part })}>Edit</Button> },
  ];
  const listColumns: TableColumn<{ list: AnswerList; uses: number }>[] = [
    { key: 'name', label: 'Answer list', render: ({ list }) => <p className="font-bold">{list.name}{list.active ? null : <Tag className="ml-2">Not available</Tag>}</p> },
    { key: 'answers', label: 'Answers', render: ({ list }) => list.answers.join(' · ') },
    { key: 'uses', label: 'Used in', className: 'hidden md:table-cell', render: ({ uses }) => `${uses} ${uses === 1 ? 'template' : 'templates'}` },
    { key: 'actions', label: 'Action', render: ({ list }) => <Button variant="outlined" fullWidth={false} className="px-3 text-sm" onClick={() => setPanel({ kind: 'list', list })}>Edit</Button> },
  ];
  const createActions = [
    { label: 'Start from a standard template', onSelect: () => setPanel('standard') },
    { label: 'Copy one of your templates', onSelect: () => setPanel('copy') },
    { label: 'Start blank', onSelect: () => navigate('/investigations/settings/templates/new') },
  ];
  const current = tab === 'templates' ? templates : tab === 'parts' ? parts : lists;
  const searchLabel = tab === 'templates' ? 'Search templates' : tab === 'parts' ? 'Search parts' : 'Search answer lists';
  const editingPart = typeof panel === 'object' && panel.kind === 'part' ? panel : undefined;
  const editingList = typeof panel === 'object' && panel.kind === 'list' ? panel : undefined;

  return <div className="min-h-screen space-y-5 bg-white px-4 py-5 md:px-8">
    <nav aria-label="Breadcrumb" className="flex flex-wrap gap-2 text-sm text-ink-soft"><Link className="font-bold text-brand" to="/investigations/catalogue">Investigation catalogue</Link><span aria-hidden="true">›</span><span>Settings</span></nav>
    <h1 className="text-[28px] font-extrabold">Catalogue settings</h1>
    <SectionTabs label="Settings sections" value={tab} options={TABS} onChange={(value) => set({ tab: value === 'templates' ? '' : value, q: '', page: '' })} />
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-[1_1_240px]"><label htmlFor="settings-search" className="mb-2 block text-sm font-bold">{searchLabel}</label><div className="flex min-h-[52px] items-center gap-3 rounded-field border border-outline px-4"><Icon name="search" className="h-5 w-5 shrink-0 text-ink-soft" /><input id="settings-search" type="search" value={query} onChange={(e) => set({ q: e.target.value, page: '' })} placeholder={tab === 'templates' ? 'Template name or test name' : tab === 'parts' ? 'Part name' : 'List name or answer'} className="min-w-0 flex-1 border-0 bg-transparent p-0 outline-none" autoComplete="off" /></div></div>
      {tab === 'templates' ? <ActionMenu label="Create template" title="Create template" actions={createActions} />
        : <Button fullWidth={false} onClick={() => setPanel(tab === 'parts' ? { kind: 'part' } : { kind: 'list' })}>{tab === 'parts' ? 'New part' : 'New answer list'}</Button>}
    </div>
    {tab === 'parts' ? <p className="text-sm text-ink-soft">Shared parts, such as Haemoglobin or Glucose, keep one unit and set of normal ranges. Changing one updates every template that uses it.</p> : null}
    {current.loading && !current.data ? <p role="status">Reading settings…</p> : current.error ? <div role="alert"><p>{current.error.message}</p><Button fullWidth={false} onClick={current.reload}>Try again</Button></div>
      : !current.data?.items.length ? <p className="rounded-field border border-dashed border-outline p-6">{query ? 'Nothing matches this search.' : tab === 'templates' ? 'No result templates yet. Start from a standard template to set up common tests quickly.' : tab === 'parts' ? 'No shared parts yet.' : 'No answer lists yet.'}</p>
      : tab === 'templates' ? <DataTable caption="Result templates" uniformHeaders rows={templates.data!.items} total={templates.data!.total} rowKey={(row) => row.template.id} page={page} onPageChange={(value) => set({ page: String(value) })} columns={templateColumns} />
      : tab === 'parts' ? <DataTable caption="Result parts library" uniformHeaders rows={parts.data!.items} total={parts.data!.total} rowKey={(row) => row.part.id} page={page} onPageChange={(value) => set({ page: String(value) })} columns={partColumns} />
      : <DataTable caption="Answer lists" uniformHeaders rows={lists.data!.items} total={lists.data!.total} rowKey={(row) => row.list.id} page={page} onPageChange={(value) => set({ page: String(value) })} columns={listColumns} />}
    {panel === 'standard' ? <StandardTemplatesSheet onClose={close} /> : panel === 'copy' ? <CopySheet onClose={close} /> : null}
    {editingPart ? <LibraryPartSheet shared={editingPart.part} lists={allLists.data ?? []} onClose={close} /> : null}
    {editingList ? <AnswerListSheet list={editingList.list} onClose={close} /> : null}
  </div>;
};
