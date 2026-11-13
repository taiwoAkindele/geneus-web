import { useEffect, useMemo, useState } from 'react';
import type { FeeItem, ImportTemplate, Payer, PayerContractVersion, TariffImportResult } from '@shared';
import { importTariff, listImportTemplates, saveImportTemplate, VerificationRequired } from '@/lib/api/insurance';
import { formatMoney, amountInput } from '@/lib/money';
import { columnName, detectHeaderRow, mappedRows, missingRequired, normalizeHeader, suggestMapping, templateFits, type ColumnMapping } from '@/lib/tabular/mapping';
import { readTableFile, type TableFile } from '@/lib/tabular/readTable';
import { downloadTable } from '@/lib/tabular/exportTable';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, TextField, useToast } from '@/ui';
import { buildTariffRows, checkTariffRows, importLines, TARIFF_FIELDS, type CheckedRow, type TariffRow } from './tariffRows';

const PAGE = 50;
const describeError = (cause: unknown) => cause instanceof VerificationRequired ? 'Your verification ended. Verify again to continue.' : cause instanceof Error ? cause.message : 'The request failed';
const STATUS_LABELS = { ready: 'Ready', needs_match: 'Needs a match', error: 'Problem', skipped: 'Skipped' } as const;
type Filter = 'all' | 'attention' | 'ready' | 'skipped';

/**
 * Imports an HMO's tariff sheet into this payer's draft contract. The file is
 * read on this device; a person checks the column mapping and every row that
 * was not an exact match; only confirmed rows are sent, and the server checks
 * them again. The draft is then reviewed and activated as usual.
 */
export const TariffImport = ({ payer, fees, draft, base, onImported }: { payer: Payer; fees: FeeItem[]; draft?: PayerContractVersion; base?: PayerContractVersion; onImported: () => void }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const terms = (draft ?? base)?.terms;
  const currency = terms?.currency ?? 'NGN';
  const tariff = terms?.tariff ?? {};
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<TableFile>(); const [reading, setReading] = useState(false); const [error, setError] = useState('');
  const [sheetIndex, setSheetIndex] = useState(0); const [headerRow, setHeaderRow] = useState(0); const [mapping, setMapping] = useState<ColumnMapping>({});
  const [templates, setTemplates] = useState<ImportTemplate[]>([]); const [template, setTemplate] = useState<ImportTemplate>(); const [templateName, setTemplateName] = useState('');
  const [rows, setRows] = useState<TariffRow[]>(); const [page, setPage] = useState(0); const [filter, setFilter] = useState<Filter>('all');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge'); const [busy, setBusy] = useState(false); const [result, setResult] = useState<TariffImportResult>();
  // Kept for the whole review, so a retry after a lost reply replays instead of applying twice.
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const sheet = file?.sheets[sheetIndex];
  const headers = sheet?.rows[headerRow] ?? [];
  const activeFees = useMemo(() => fees.filter((f) => f.active).sort((a, b) => a.name.localeCompare(b.name)), [fees]);
  const feeName = useMemo(() => new Map(fees.map((f) => [f.id, f.name])), [fees]);

  useEffect(() => { if (open) listImportTemplates(context, 'contract_tariff').then((r) => setTemplates(r.templates), () => undefined); }, [open, context]);

  const reset = () => { setFile(undefined); setRows(undefined); setResult(undefined); setError(''); setTemplate(undefined); setRequestKey(crypto.randomUUID()); };
  const layout = (parsed: TableFile, index: number) => {
    const target = parsed.sheets[index];
    const fitting = templates.filter((t) => !t.payerId || t.payerId === payer.id).find((t) => templateFits(t, target.rows));
    if (fitting) { setHeaderRow(fitting.headerRow); setMapping(fitting.mapping); setTemplate(fitting); setTemplateName(fitting.name); return; }
    const header = detectHeaderRow(target.rows, TARIFF_FIELDS);
    setHeaderRow(header); setMapping(suggestMapping(target.rows[header] ?? [], TARIFF_FIELDS)); setTemplate(undefined); setTemplateName(`${payer.name} tariff`);
  };
  const choose = async (chosen?: File) => {
    if (!chosen) return;
    reset(); setReading(true);
    try { const parsed = await readTableFile(chosen); setFile(parsed); setSheetIndex(0); layout(parsed, 0); }
    catch (cause) { setError(describeError(cause)); } finally { setReading(false); }
  };
  const review = () => {
    if (!sheet) return;
    setRows(buildTariffRows(mappedRows(sheet.rows, headerRow, mapping), activeFees, tariff)); setPage(0); setFilter('all');
  };
  const checked = useMemo(() => rows ? checkTariffRows(rows, fees, currency, tariff) : [], [rows, fees, currency, tariff]);
  const counts = useMemo(() => ({
    ready: checked.filter((r) => r.status === 'ready').length, attention: checked.filter((r) => r.status === 'needs_match' || r.status === 'error').length, skipped: checked.filter((r) => r.status === 'skipped').length,
    added: checked.filter((r) => r.change === 'new').length, changed: checked.filter((r) => r.change === 'changed').length, same: checked.filter((r) => r.change === 'same').length,
  }), [checked]);
  const visible = checked.filter((r) => filter === 'all' || (filter === 'attention' ? r.status === 'needs_match' || r.status === 'error' : r.status === filter));
  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const update = (sourceRow: number, change: Partial<TariffRow>) => setRows((current) => current?.map((r) => r.sourceRow === sourceRow ? { ...r, ...change } : r));

  const saveTemplate = async () => {
    if (!templateName.trim()) return;
    try {
      const saved = await saveImportTemplate(context, { kind: 'contract_tariff', payerId: payer.id, name: templateName.trim(), headerRow, mapping, headers: headers.map(normalizeHeader), ...(template && template.name.toLowerCase() === templateName.trim().toLowerCase() ? { expectedRevision: template.revision } : {}) });
      setTemplate(saved); setTemplates((all) => [saved, ...all.filter((t) => t.id !== saved.id)]); toast(`Mapping "${saved.name}" saved for next time.`);
    } catch (cause) { setError(describeError(cause)); }
  };
  const apply = async () => {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const done = await importTariff(context, {
        payerId: payer.id, requestKey, mode, lines: importLines(checked), ...(draft ? { expectedRevision: draft.revision } : {}),
        source: { fileName: file.fileName.slice(0, 255), sha256: file.sha256, ...(sheet ? { sheet: sheet.name.slice(0, 100) } : {}), rows: checked.length, ...(template ? { templateId: template.id } : {}) },
      });
      setResult(done); toast(`Draft version ${done.version} updated from the sheet.`); onImported();
    } catch (cause) { setError(describeError(cause)); } finally { setBusy(false); }
  };
  const downloadTemplate = () => downloadTable(`${payer.code}-tariff.xlsx`, 'Tariff', [
    ['Geneus service id', 'Service name', 'Category', 'Hospital price', 'Contract price', "Payer's service code"],
    ...activeFees.filter((f) => f.currency === currency).map((f) => [f.id, f.name, f.category, amountInput(f.amountMinor, f.currency), tariff[f.id] ? amountInput(tariff[f.id].unitMinor, currency) : '', tariff[f.id]?.payerCode ?? '']),
  ]).catch((cause) => setError(describeError(cause)));

  if (!terms) return <p className="text-sm text-ink-soft">Save a first contract version with its plans before importing a tariff sheet.</p>;
  if (!open) return <div className="flex flex-wrap gap-2"><Button variant="outlined" fullWidth={false} onClick={() => setOpen(true)}>Import tariff sheet</Button><Button variant="ghost" fullWidth={false} onClick={() => void downloadTemplate()}>Download tariff sheet</Button></div>;

  return <section aria-label="Import tariff" className="space-y-4 rounded-card border border-outline-soft bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Import tariff sheet</h3><Button variant="ghost" fullWidth={false} onClick={() => { reset(); setOpen(false); }}>Close</Button></div>
    <p className="text-sm text-ink-soft">Excel (.xlsx) or CSV, up to 5 MB and 5,000 rows. The file stays on this device; only the rows you confirm are sent. Prices go into draft version {draft?.version ?? (base ? base.version + 1 : 1)}, which is activated separately.</p>
    {error ? <p role="alert" className="rounded-field border border-danger bg-danger-bg p-3 text-sm text-danger">{error}</p> : null}

    {result ? <div role="status" className="space-y-2 rounded-field border border-outline-soft p-3 text-sm">
      <p className="font-semibold">Draft version {result.version} updated.</p>
      <p>{result.added} added · {result.changed} changed · {result.unchanged} unchanged{result.removed ? ` · ${result.removed} removed` : ''}.</p>
      <p className="text-ink-soft">Review the draft below, then activate it when it is right.</p>
      <Button variant="outlined" fullWidth={false} onClick={reset}>Import another sheet</Button>
    </div> : !file ? <label className="block text-sm"><span className="font-semibold">Spreadsheet</span>
      <input aria-label="Tariff spreadsheet" className="mt-1 block w-full text-sm" type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={reading} onChange={(e) => void choose(e.target.files?.[0])} />
      {reading ? <span role="status" className="mt-1 block">Reading…</span> : null}</label>
    : !rows ? <div className="space-y-3">
      <p className="text-sm"><strong>{file.fileName}</strong> · {sheet?.rows.length ?? 0} rows{sheet?.truncatedRows ? ' (only the first 5,000 rows are read)' : ''}{sheet?.truncatedColumns ? ' · extra columns ignored' : ''}{sheet?.longCells ? ` · ${sheet.longCells} long cell(s) shortened` : ''}</p>
      {template ? <p role="status" className="rounded-field border border-outline-soft bg-surface-muted p-2 text-sm">Saved mapping “{template.name}” applied. Check it below.</p> : null}
      {file.sheets.length > 1 ? <SelectField label="Sheet" value={String(sheetIndex)} options={file.sheets.map((s, i) => ({ value: String(i), label: s.name }))} onChange={(e) => { const i = Number(e.target.value); setSheetIndex(i); layout(file, i); }} /> : null}
      <SelectField label="Header row" value={String(headerRow)} options={(sheet?.rows ?? []).slice(0, 20).map((r, i) => ({ value: String(i), label: `Row ${i + 1}: ${r.filter(Boolean).slice(0, 4).join(' · ').slice(0, 80) || '(blank)'}` }))}
        onChange={(e) => { const h = Number(e.target.value); setHeaderRow(h); setMapping(suggestMapping(sheet?.rows[h] ?? [], TARIFF_FIELDS)); setTemplate(undefined); }} />
      <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-1 text-sm font-semibold">Which column holds each item</legend>
        {TARIFF_FIELDS.map((field) => <SelectField key={field.key} label={`${field.label}${field.required ? '' : ' (optional)'}`} value={mapping[field.key] === undefined ? '' : String(mapping[field.key])}
          options={[{ value: '', label: 'Not in this sheet' }, ...headers.map((h, i) => ({ value: String(i), label: columnName(i, h) }))]}
          onChange={(e) => setMapping((m) => { const next = { ...m }; if (e.target.value === '') delete next[field.key]; else next[field.key] = Number(e.target.value); return next; })} />)}
      </fieldset>
      {missingRequired(mapping, TARIFF_FIELDS).length ? <p role="alert" className="text-sm text-danger">Choose a column for: {missingRequired(mapping, TARIFF_FIELDS).map((f) => f.label).join(', ')}.</p> : null}
      <div className="flex flex-wrap items-end gap-2"><div className="min-w-[240px] flex-1"><TextField label="Save this mapping as (optional)" value={templateName} onChange={(e) => setTemplateName(e.target.value)} /></div>
        <Button variant="ghost" fullWidth={false} disabled={!templateName.trim() || missingRequired(mapping, TARIFF_FIELDS).length > 0} onClick={() => void saveTemplate()}>Save mapping</Button></div>
      <div className="flex gap-2"><Button fullWidth={false} disabled={missingRequired(mapping, TARIFF_FIELDS).length > 0} onClick={review}>Review rows</Button><Button variant="ghost" fullWidth={false} onClick={reset}>Choose another file</Button></div>
    </div>
    : <div className="space-y-3">
      <p data-testid="import-summary" className="text-sm"><strong>{counts.ready}</strong> ready ({counts.added} new, {counts.changed} changed, {counts.same} unchanged) · <strong>{counts.attention}</strong> need attention · {counts.skipped} skipped</p>
      <div role="group" aria-label="Show rows" className="flex flex-wrap gap-2">{(['all', 'attention', 'ready', 'skipped'] as const).map((f) => <Button key={f} variant={filter === f ? 'secondary' : 'ghost'} fullWidth={false} onClick={() => { setFilter(f); setPage(0); }}>{f === 'all' ? `All (${checked.length})` : f === 'attention' ? `Needs attention (${counts.attention})` : f === 'ready' ? `Ready (${counts.ready})` : `Skipped (${counts.skipped})`}</Button>)}</div>
      <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
        <thead><tr className="border-b border-outline-soft"><th className="p-2">Row</th><th className="p-2">In the sheet</th><th className="p-2">Hospital service</th><th className="p-2">Contract price</th><th className="p-2">Status</th><th className="p-2">Import</th></tr></thead>
        <tbody>{visible.slice(page * PAGE, page * PAGE + PAGE).map((r) => <ReviewRow key={r.sourceRow} row={r} fees={activeFees} feeName={feeName} currency={currency} previous={r.feeItemId ? tariff[r.feeItemId]?.unitMinor : undefined} onChange={(change) => update(r.sourceRow, change)} />)}</tbody>
      </table></div>
      {pages > 1 ? <div className="flex items-center gap-2 text-sm"><Button variant="ghost" fullWidth={false} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page + 1} of {pages}</span><Button variant="ghost" fullWidth={false} disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button></div> : null}
      {counts.attention ? <Button variant="ghost" fullWidth={false} onClick={() => setRows((current) => current?.map((r) => { const c = checked.find((x) => x.sourceRow === r.sourceRow); return c && (c.status === 'needs_match' || c.status === 'error') ? { ...r, include: false } : r; }))}>Skip the {counts.attention} row{counts.attention === 1 ? '' : 's'} needing attention</Button> : null}
      <fieldset className="space-y-1 text-sm"><legend className="font-semibold">Prices not in this sheet</legend>
        <label className="flex min-h-[40px] items-center gap-2"><input type="radio" name="tariff-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />Keep them (update only the services in the sheet)</label>
        <label className="flex min-h-[40px] items-center gap-2"><input type="radio" name="tariff-mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />Remove them (the sheet is the whole tariff)</label>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button fullWidth={false} loading={busy} disabled={busy || counts.attention > 0 || counts.ready === 0} onClick={() => void apply()}>Apply {counts.ready} price{counts.ready === 1 ? '' : 's'} to the draft</Button>
        <Button variant="ghost" fullWidth={false} onClick={() => setRows(undefined)}>Back to columns</Button>
      </div>
      {counts.attention > 0 ? <p className="text-sm text-ink-soft">Resolve or skip every row needing attention before applying.</p> : null}
    </div>}
  </section>;
};

const ReviewRow = ({ row, fees, feeName, currency, previous, onChange }: { row: CheckedRow; fees: FeeItem[]; feeName: Map<string, string>; currency: string; previous?: number; onChange: (change: Partial<TariffRow>) => void }) => {
  const suggestions = row.match.kind === 'suggested' ? row.match.options.map((o) => o.id) : [];
  const options = [{ value: '', label: row.match.kind === 'suggested' ? 'Choose a suggested service…' : 'Choose a service…' },
    ...suggestions.map((id) => ({ value: id, label: `Suggested: ${feeName.get(id) ?? id}` })),
    ...fees.filter((f) => !suggestions.includes(f.id)).map((f) => ({ value: f.id, label: f.name }))];
  const tone = row.status === 'ready' ? 'text-success' : row.status === 'skipped' ? 'text-ink-soft' : 'text-danger';
  return <tr data-row={row.sourceRow} data-status={row.status} className="border-b border-outline-soft align-top">
    <td className="p-2">{row.sourceRow}</td>
    <td className="p-2"><span className="block">{row.source.name || '—'}</span>{row.source.code ? <span className="block text-xs text-ink-soft">Code {row.source.code}</span> : null}</td>
    <td className="min-w-[220px] p-2">{row.match.kind === 'exact' && row.feeItemId === row.match.id
      ? <span>{feeName.get(row.match.id)} <span className="text-xs text-ink-soft">({row.match.by === 'id' ? 'Geneus id' : row.match.by === 'code' ? 'same code' : 'same name'})</span> <button type="button" className="text-xs font-semibold text-brand underline" onClick={() => onChange({ feeItemId: undefined })}>Change</button></span>
      : <SelectField label={`Service for row ${row.sourceRow}`} value={row.feeItemId ?? ''} options={options} onChange={(e) => onChange({ feeItemId: e.target.value || undefined, include: true })} />}</td>
    <td className="min-w-[140px] p-2"><TextField label={`Price for row ${row.sourceRow}`} inputMode="decimal" value={row.price} onChange={(e) => onChange({ price: e.target.value })} />
      {previous !== undefined ? <span className="block text-xs text-ink-soft">Now {formatMoney(previous, currency)}</span> : null}</td>
    <td className={`p-2 ${tone}`}>{STATUS_LABELS[row.status]}{row.change ? ` · ${row.change === 'new' ? 'new' : row.change === 'changed' ? 'changed' : 'unchanged'}` : ''}{row.problem ? <span className="block text-xs">{row.problem}</span> : null}</td>
    <td className="p-2"><input type="checkbox" aria-label={`Import row ${row.sourceRow}`} checked={row.include} onChange={(e) => onChange({ include: e.target.checked })} /></td>
  </tr>;
};
