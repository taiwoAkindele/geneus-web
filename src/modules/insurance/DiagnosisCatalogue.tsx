import { useCallback, useEffect, useMemo, useState } from 'react';
import { DiagnosisCatalogueImport, type DiagnosisCatalogueSummary } from '@shared';
import { importDiagnosisCatalogue, listDiagnosisCatalogues, VerificationRequired } from '@/lib/api/insurance';
import { columnName, detectHeaderRow, mappedRows, missingRequired, suggestMapping, type ColumnMapping, type FieldSpec } from '@/lib/tabular/mapping';
import { readTableFile, type TableFile } from '@/lib/tabular/readTable';
import { useAuthorizationContext } from '@/session';
import { Button, SelectField, TextField, useToast } from '@/ui';

const describeError = (cause: unknown) => cause instanceof VerificationRequired ? 'Your session with the server ended. Confirm your PIN to continue.' : cause instanceof Error ? cause.message : 'The request failed';
export const CATALOGUE_FIELDS: FieldSpec[] = [
  { key: 'code', label: 'Code', required: true, synonyms: ['code', 'icd', 'icd10', 'icd 10 code', 'diagnosis code', 'dx code'] },
  { key: 'description', label: 'Description', required: true, synonyms: ['description', 'title', 'name', 'diagnosis', 'label', 'term'] },
];

/** Rows of a mapped sheet as catalogue lines, with blank rows skipped. */
export const catalogueLines = (rows: readonly { sourceRow: number; values: Record<string, string> }[]) =>
  rows.filter((r) => (r.values.code ?? '').trim() || (r.values.description ?? '').trim()).map((r) => ({ code: (r.values.code ?? '').trim(), description: (r.values.description ?? '').trim(), sourceRow: r.sourceRow }));

/**
 * The hospital's licensed diagnosis code list (audit H1). Geneus ships none:
 * the hospital imports the list it holds a licence for, naming that licence.
 * Payers that require verified codes are checked against it; a code not in it
 * keeps the claim blocked rather than being treated as valid.
 */
export const DiagnosisCatalogue = () => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const canManage = context.permissions.includes('insurance_contract:manage');
  const [catalogues, setCatalogues] = useState<DiagnosisCatalogueSummary[]>(); const [error, setError] = useState('');
  const [file, setFile] = useState<TableFile>(); const [sheetIndex, setSheetIndex] = useState(0); const [headerRow, setHeaderRow] = useState(0); const [mapping, setMapping] = useState<ColumnMapping>({});
  const [codeSystem, setCodeSystem] = useState('ICD-10'); const [edition, setEdition] = useState(''); const [licence, setLicence] = useState(''); const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [busy, setBusy] = useState(false); const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const load = useCallback(async () => { try { setCatalogues((await listDiagnosisCatalogues(context)).catalogues); } catch (cause) { setError(describeError(cause)); } }, [context]);
  useEffect(() => { void load(); }, [load]);
  const sheet = file?.sheets[sheetIndex];
  const headers = sheet?.rows[headerRow] ?? [];
  const lines = useMemo(() => sheet ? catalogueLines(mappedRows(sheet.rows, headerRow, mapping)) : [], [sheet, headerRow, mapping]);
  const parsed = useMemo(() => file && lines.length ? DiagnosisCatalogueImport.safeParse({ codeSystem, edition, licenceReference: licence, mode, lines,
    source: { fileName: file.fileName, sha256: file.sha256, rows: lines.length }, requestKey }) : undefined, [file, lines, codeSystem, edition, licence, mode, requestKey]);
  const choose = async (chosen?: File) => {
    if (!chosen) return;
    setError(''); setFile(undefined);
    try {
      const table = await readTableFile(chosen);
      const header = detectHeaderRow(table.sheets[0].rows, CATALOGUE_FIELDS);
      setFile(table); setSheetIndex(0); setHeaderRow(header); setMapping(suggestMapping(table.sheets[0].rows[header] ?? [], CATALOGUE_FIELDS)); setRequestKey(crypto.randomUUID());
    } catch (cause) { setError(describeError(cause)); }
  };
  const submit = async () => {
    if (!parsed?.success) return;
    setBusy(true); setError('');
    try {
      const r = await importDiagnosisCatalogue(context, parsed.data);
      toast(`${r.codes} codes in your ${codeSystem} list: ${r.added} added, ${r.changed} changed, ${r.removed} removed.`);
      setFile(undefined); setRequestKey(crypto.randomUUID()); await load();
    } catch (cause) { setError(describeError(cause)); } finally { setBusy(false); }
  };
  return <section aria-label="Diagnosis code list" className="space-y-3 rounded-card border border-outline-soft bg-white p-4">
    <h2 className="text-lg font-bold">Diagnosis code lists</h2>
    <p className="text-sm text-ink-soft">For payers that require verified diagnosis codes, import the code list your hospital holds a licence for (for example ICD-10). Geneus does not supply one. A code missing from your list keeps the claim blocked; it is never treated as valid.</p>
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {!catalogues ? <p role="status" className="text-sm">Loading…</p> : catalogues.length === 0 ? <p className="text-sm">No code list imported.</p>
      : <ul className="space-y-1 text-sm">{catalogues.map((c) => <li key={c.codeSystem}><strong>{c.codeSystem}</strong> · {c.codes} codes · {c.edition} · licence: {c.licenceReference} · imported {c.importedOn.slice(0, 10)}</li>)}</ul>}
    {canManage ? <div className="space-y-3">
      <label className="block text-sm"><span className="font-semibold">Code list file (CSV or Excel)</span><input className="mt-1 block w-full text-sm" type="file" accept=".csv,.xlsx,.xls" onChange={(e) => void choose(e.target.files?.[0])} /></label>
      {file && sheet ? <div className="space-y-3 rounded-field border border-outline-soft p-3">
        {file.sheets.length > 1 ? <SelectField label="Sheet" value={String(sheetIndex)} options={file.sheets.map((s, i) => ({ value: String(i), label: s.name }))} onChange={(e) => setSheetIndex(Number(e.target.value))} /> : null}
        <TextField label="Header row" inputMode="numeric" value={String(headerRow + 1)} onChange={(e) => setHeaderRow(Math.max(0, Number(e.target.value.replace(/\D/g, '') || 1) - 1))} />
        {CATALOGUE_FIELDS.map((f) => <SelectField key={f.key} label={`${f.label} column`} value={mapping[f.key] === undefined ? '' : String(mapping[f.key])}
          options={[{ value: '', label: 'Not in this file' }, ...headers.map((h, i) => ({ value: String(i), label: columnName(i, h) }))]}
          onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value === '') delete n[f.key]; else n[f.key] = Number(e.target.value); return n; })} />)}
        <div className="grid gap-2 sm:grid-cols-2">
          <TextField label="Code system" value={codeSystem} onChange={(e) => setCodeSystem(e.target.value)} />
          <TextField label="Edition or version" value={edition} onChange={(e) => setEdition(e.target.value)} />
        </div>
        <TextField label="Licence or source reference" value={licence} onChange={(e) => setLicence(e.target.value)} />
        <SelectField label="This file" value={mode} options={[{ value: 'merge', label: 'Adds to and updates the current list' }, { value: 'replace', label: 'Is the whole list (codes not in it are removed)' }]} onChange={(e) => setMode(e.target.value as typeof mode)} />
        <p className="text-sm">{lines.length} code{lines.length === 1 ? '' : 's'} found.</p>
        {missingRequired(mapping, CATALOGUE_FIELDS).length ? <p className="text-sm text-danger">Choose the code and description columns.</p> : null}
        {parsed && !parsed.success ? <ul className="max-h-40 overflow-y-auto text-sm text-danger">{parsed.error.issues.slice(0, 20).map((i, n) => <li key={n}>{i.message}</li>)}</ul> : null}
        <Button fullWidth={false} loading={busy} disabled={!parsed?.success} onClick={() => void submit()}>Import code list</Button>
      </div> : null}
    </div> : null}
  </section>;
};
