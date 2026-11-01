import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from '@/data';
import { useAuthorizationContext } from '@/session';
import { loadCataloguePage, setInvestigationPrice, type CatalogueRow } from '@/data/repos/investigations';
import { ApiError } from '@/lib/api/client';
import { addOwnTests, adoptStandardTests, listStandardTests, type AddedTests, type OwnTest, type StandardTestOption } from '@/lib/api/investigations';
import { ActionMenu, Button, DataTable, Icon, Sheet, SheetCancelButton, Tag, TextField, type TableColumn } from '@/ui';
import { amountInput, formatMoney, parseAmount } from '@/lib/money';
import { parseTestCsv, TEST_CSV_TEMPLATE, type CsvIssue } from '@/features/investigations/testCsv';

type Panel = 'single' | 'upload' | 'standard' | { edit: CatalogueRow };
/** Adding tests needs the server; say so plainly instead of a transport error. */
const errorText = (cause: unknown) => cause instanceof ApiError && cause.code === 'offline' ? 'Connect to the internet to add tests. The catalogue itself keeps working offline.' : cause instanceof Error ? cause.message : 'Could not save';
const isStandard = (row: CatalogueRow) => row.definition.concept.system !== 'local';
const plural = (count: number) => `${count} ${count === 1 ? 'test' : 'tests'}`;

const AddedMessage = ({ added, skipped }: AddedTests) => <div role="status" className="space-y-1 rounded-field border border-outline-soft bg-brand-wash p-3 text-sm">
  <p className="font-bold">{added.length ? `Added ${plural(added.length)}. They appear in the table when this device next syncs. Set prices with Edit.` : 'No new tests were added.'}</p>
  {skipped.length ? <p>Skipped because they are already in the catalogue: {skipped.join(', ')}</p> : null}
</div>;

const SingleTestSheet = ({ onClose }: { onClose: () => void }) => {
  const context = useAuthorizationContext();
  const [draft, setDraft] = useState({ name: '', specimen: '', classification: '', aliases: '' });
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try {
      const result = await addOwnTests(context.userId, [{ ...draft, aliases: draft.aliases.split(/[;,]/).map((alias) => alias.trim()).filter(Boolean) }]);
      if (result.added.length) onClose(); else setError('A test with this name or other name is already in the catalogue');
    } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  return <Sheet title="Add a single test" placement="side" onClose={onClose} hasUnsavedChanges={Boolean(draft.name || draft.specimen)}>
    <div className="space-y-4">
      <TextField label="Test name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
      <TextField label="Specimen" value={draft.specimen} onChange={(e) => setDraft({ ...draft, specimen: e.target.value })} />
      <TextField label="Classification" value={draft.classification} onChange={(e) => setDraft({ ...draft, classification: e.target.value })} />
      <TextField label="Other names (optional)" value={draft.aliases} onChange={(e) => setDraft({ ...draft, aliases: e.target.value })} />
      <p className="text-sm text-ink-soft">Separate other names with commas, for example "FBC, CBC". Set the price with Edit after adding. Adding a test needs an internet connection.</p>
      {error ? <p role="alert" className="text-danger-strong">{error}</p> : null}
      <div className="flex flex-wrap gap-2"><SheetCancelButton /><Button fullWidth={false} loading={busy} disabled={busy || !draft.name.trim() || !draft.specimen.trim() || !draft.classification.trim()} onClick={() => void save()}>Add test</Button></div>
    </div>
  </Sheet>;
};

const UploadSheet = ({ onClose }: { onClose: () => void }) => {
  const context = useAuthorizationContext();
  const [file, setFile] = useState(''), [parsed, setParsed] = useState<{ tests: OwnTest[]; issues: CsvIssue[] }>();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [result, setResult] = useState<AddedTests>();
  const template = useMemo(() => `data:text/csv;charset=utf-8,${encodeURIComponent(TEST_CSV_TEMPLATE)}`, []);
  const read = async (chosen?: File) => { setResult(undefined); setError(''); if (!chosen) return; setFile(chosen.name); setParsed(parseTestCsv(await chosen.text())); };
  const add = async () => {
    if (!parsed) return; setBusy(true); setError('');
    try { setResult(await addOwnTests(context.userId, parsed.tests)); setParsed(undefined); setFile(''); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  return <Sheet title="Upload a list of tests" placement="side" onClose={onClose} hasUnsavedChanges={Boolean(parsed?.tests.length)}>
    <div className="space-y-4">
      <p className="text-sm">Use a CSV file with the columns <b>Test name</b>, <b>Specimen</b>, <b>Classification</b> and <b>Other names</b>. Separate other names with semicolons. Excel and Google Sheets can save a sheet as CSV.</p>
      <a className="inline-flex min-h-[44px] items-center font-bold text-brand" href={template} download="lab-tests-template.csv">Download template</a>
      <label className="block text-sm font-bold">CSV file<input type="file" accept=".csv,text/csv" className="mt-2 block w-full text-sm" onChange={(e) => void read(e.target.files?.[0])} /></label>
      {parsed ? <div className="space-y-2 rounded-field border border-outline-soft p-3 text-sm">
        <p className="font-bold">{file}: {plural(parsed.tests.length)} ready to add</p>
        {parsed.issues.length ? <div role="alert"><p className="font-bold text-danger-strong">{parsed.issues.length} {parsed.issues.length === 1 ? 'row' : 'rows'} will be left out:</p><ul className="list-disc pl-5">{parsed.issues.map((issue) => <li key={issue.line}>Line {issue.line}: {issue.message}</li>)}</ul></div> : null}
        <p className="text-ink-soft">Tests whose name or other name is already in the catalogue are skipped.</p>
      </div> : null}
      {result ? <AddedMessage {...result} /> : null}
      {error ? <p role="alert" className="text-danger-strong">{error}</p> : null}
      <div className="flex flex-wrap gap-2"><SheetCancelButton>{result ? 'Done' : 'Cancel'}</SheetCancelButton><Button fullWidth={false} loading={busy} disabled={busy || !parsed?.tests.length} onClick={() => void add()}>Add {parsed?.tests.length ?? ''} tests</Button></div>
    </div>
  </Sheet>;
};

const StandardTestsSheet = ({ onClose }: { onClose: () => void }) => {
  const context = useAuthorizationContext();
  const [tests, setTests] = useState<StandardTestOption[]>(), [loadError, setLoadError] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<AddedTests>();
  const load = useCallback(() => { setLoadError(''); listStandardTests(context.userId).then((response) => setTests(response.tests)).catch((cause) => setLoadError(errorText(cause))); }, [context.userId]);
  useEffect(load, [load]);
  const available = (tests ?? []).filter((test) => !test.added);
  const groups = [...new Set((tests ?? []).map((test) => test.classification))];
  const toggle = (key: string) => setPicked((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const add = async () => {
    setBusy(true); setError('');
    try { setResult(await adoptStandardTests(context.userId, [...picked])); setPicked(new Set()); load(); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  return <Sheet title="Choose from standard tests" placement="side" onClose={onClose} hasUnsavedChanges={picked.size > 0}>
    <div className="space-y-4">
      <p className="text-sm">Commonly used tests based on the WHO Essential Diagnostics List. Tick the ones this facility performs. Tests already in your catalogue are marked and can't be added twice.</p>
      {loadError ? <div role="alert" className="space-y-2"><p className="text-danger-strong">{loadError}</p><Button variant="outlined" fullWidth={false} onClick={load}>Try again</Button></div>
        : !tests ? <p role="status">Reading standard tests…</p> : <>
          <Button variant="outlined" fullWidth={false} disabled={!available.length} onClick={() => setPicked(picked.size === available.length ? new Set() : new Set(available.map((t) => t.key)))}>{picked.size === available.length && available.length ? 'Clear selection' : `Select all ${available.length} available`}</Button>
          {groups.map((group) => <fieldset key={group} className="space-y-1"><legend className="text-xs font-bold uppercase tracking-wider text-brand-strong">{group}</legend>
            {tests.filter((test) => test.classification === group).map((test) => <label key={test.key} className={`flex min-h-[44px] items-start gap-3 rounded-field px-2 py-2 ${test.added ? 'text-ink-muted' : 'hover:bg-surface'}`}>
              <input type="checkbox" className="mt-1 h-5 w-5 min-h-0 accent-brand" checked={picked.has(test.key)} disabled={test.added} onChange={() => toggle(test.key)} />
              <span className="text-sm"><b>{test.name}</b>{test.added ? <Tag className="ml-2">Already added</Tag> : null}<span className="block text-xs text-ink-soft">{test.specimen} · Also: {test.aliases.join(', ')}</span></span>
            </label>)}
          </fieldset>)}
        </>}
      {result ? <AddedMessage {...result} /> : null}
      {error ? <p role="alert" className="text-danger-strong">{error}</p> : null}
      <div className="flex flex-wrap gap-2"><SheetCancelButton>{result ? 'Done' : 'Cancel'}</SheetCancelButton><Button fullWidth={false} loading={busy} disabled={busy || !picked.size} onClick={() => void add()}>Add {picked.size} selected {picked.size === 1 ? 'test' : 'tests'}</Button></div>
    </div>
  </Sheet>;
};

const EditSheet = ({ row, onClose }: { row: CatalogueRow; onClose: () => void }) => {
  const context = useAuthorizationContext(), canPrice = context.permissions.includes('fee_item:manage');
  const currency = row.fee?.currency ?? 'NGN';
  const [price, setPrice] = useState(row.fee ? amountInput(row.fee.amountMinor, currency) : ''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const save = async () => {
    setBusy(true); setError('');
    try { await setInvestigationPrice(row, parseAmount(price, currency), context); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save'); } finally { setBusy(false); }
  };
  return <Sheet title={row.definition.name} eyebrow="Edit test" placement="side" onClose={onClose}>
    <div className="space-y-4">
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="font-semibold text-ink-soft">Specimen</dt><dd>{row.definition.investigation?.specimen}</dd></div>
        <div><dt className="font-semibold text-ink-soft">Classification</dt><dd>{row.definition.investigation?.department}</dd></div>
      </dl>
      {canPrice ? <><TextField label={`Price (${currency})`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /><p className="text-sm text-ink-soft">Charged when the test is ordered. Orders already placed keep the price they recorded.</p></>
        : <p className="text-sm">Setting a price needs permission to manage fees. Ask a facility administrator.</p>}
      {row.offering ? <Link className="inline-flex min-h-[44px] items-center font-bold text-brand" to={`/facility/services/${encodeURIComponent(row.offering.id)}`}>Availability and other settings</Link> : null}
      {error ? <p role="alert" className="text-danger-strong">{error}</p> : null}
      <div className="flex flex-wrap gap-2"><SheetCancelButton />{canPrice ? <Button fullWidth={false} loading={busy} disabled={busy || !price.trim()} onClick={() => void save()}>Save price</Button> : null}</div>
    </div>
  </Sheet>;
};

export const InvestigationCatalogueScreen = () => {
  const context = useAuthorizationContext(), [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '', page = Math.max(0, Number(params.get('page')) || 0), descending = params.get('descending') === '1';
  const data = useLiveQuery(useCallback(() => loadCataloguePage(context, { query, page, descending }), [context.facilityId, query, page, descending]));
  const [panel, setPanel] = useState<Panel>();
  const canManage = context.permissions.includes('service:manage');
  useEffect(() => { document.title = 'Investigation catalogue · Geneus Health'; }, []);
  const set = (changes: Record<string, string>) => setParams((current) => { const next = new URLSearchParams(current); for (const [key, value] of Object.entries(changes)) { if (value) next.set(key, value); else next.delete(key); } return next; }, { replace: true });
  const close = () => { setPanel(undefined); data.reload(); };
  const empty = data.data?.total === 0 && !query;
  const columns: TableColumn<CatalogueRow>[] = [
    { key: 'name', label: 'Test', sortValue: (row) => row.definition.name, render: (row) => <div className="min-w-[160px]"><p className="font-bold text-brand">{row.definition.name}</p>{row.definition.investigation?.aliases.length ? <p className="text-xs text-ink-soft">Also: {row.definition.investigation.aliases.join(', ')}</p> : null}</div> },
    { key: 'specimen', label: 'Specimen', className: 'hidden md:table-cell', render: (row) => row.definition.investigation?.specimen },
    { key: 'classification', label: 'Classification', className: 'hidden md:table-cell', render: (row) => row.definition.investigation?.department },
    { key: 'source', label: 'Source', className: 'hidden lg:table-cell', render: (row) => isStandard(row) ? <Tag tone="green">Standard</Tag> : <Tag>Own test</Tag> },
    { key: 'price', label: 'Price', render: (row) => row.fee ? formatMoney(row.fee.amountMinor, row.fee.currency) : <span className="text-ink-soft">—</span> },
    ...(canManage ? [{ key: 'actions', label: 'Action', render: (row: CatalogueRow) => <Button variant="outlined" fullWidth={false} className="px-3 text-sm" onClick={() => setPanel({ edit: row })}>Edit</Button> }] : []),
  ];
  const addActions = [{ label: 'Add a single test', onSelect: () => setPanel('single') }, { label: 'Upload a list of tests', onSelect: () => setPanel('upload') }, { label: 'Choose from standard tests', onSelect: () => setPanel('standard') }];
  return <div className="min-h-screen space-y-5 bg-white px-4 py-5 md:px-8">
    <header className="flex flex-wrap items-start justify-between gap-3"><h1 className="text-[28px] font-extrabold">Investigation catalogue</h1>{canManage && !empty ? <ActionMenu label="Add tests" title="Add tests" actions={addActions} /> : null}</header>
    {empty ? <section aria-label="No tests yet" className="flex flex-col items-center gap-3 rounded-card border border-dashed border-outline px-6 py-10 text-center">
      <h2 className="text-xl font-extrabold">This facility has no lab tests yet</h2>
      <p className="max-w-xl text-ink-soft">Start with standard tests used in most facilities, with specimens and other names already filled in. You can set prices, or add your own tests afterwards.</p>
      {canManage ? <div className="mt-2 flex flex-wrap justify-center gap-2"><Button fullWidth={false} onClick={() => setPanel('standard')}>Choose from standard tests</Button><Button variant="outlined" fullWidth={false} onClick={() => setPanel('upload')}>Upload a list of tests</Button><Button variant="outlined" fullWidth={false} onClick={() => setPanel('single')}>Add a single test</Button></div>
        : <p className="text-sm">Ask a facility administrator to add the tests this facility performs.</p>}
    </section> : <>
      <div><label htmlFor="test-search" className="mb-2 block text-sm font-bold">Search tests</label><div className="flex min-h-[52px] items-center gap-3 rounded-field border border-outline px-4"><Icon name="search" className="h-5 w-5 shrink-0 text-ink-soft" /><input id="test-search" type="search" value={query} onChange={(e) => set({ q: e.target.value, page: '' })} placeholder="Test name, other name or specimen" className="min-w-0 flex-1 border-0 bg-transparent p-0 outline-none" autoComplete="off" /></div></div>
      {data.loading && !data.data ? <p role="status">Reading tests…</p> : data.error ? <div role="alert"><p>{data.error.message}</p><Button fullWidth={false} onClick={data.reload}>Try again</Button></div>
        : data.data?.items.length ? <DataTable caption="Lab tests" uniformHeaders rows={data.data.items} total={data.data.total} rowKey={(row) => row.definition.id} page={page} onPageChange={(value) => set({ page: String(value) })} sort={{ key: 'name', descending }} onSortChange={(value) => set({ descending: value.descending ? '1' : '', page: '' })} columns={columns} />
        : <p className="rounded-field border border-dashed border-outline p-6">No tests match this search.</p>}
    </>}
    {panel === 'single' ? <SingleTestSheet onClose={close} /> : panel === 'upload' ? <UploadSheet onClose={close} /> : panel === 'standard' ? <StandardTestsSheet onClose={close} /> : panel ? <EditSheet row={panel.edit} onClose={close} /> : null}
  </div>;
};
