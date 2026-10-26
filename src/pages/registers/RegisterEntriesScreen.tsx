import { useEffect, useRef, useState } from 'react';
import { validateRegisterEntry } from '@shared';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Icon, Sheet, SheetCancelButton, TextField, useToast } from '@/ui';
import { downloadCsv } from '@/lib/csv';
import { useAuthorizationContext, useSession } from '@/session';
import { RegisterField, useRegisters, type EntryValue, type EntryValues, type RegisterDef } from '@/features/registers';

const fmtCell = (v: EntryValue | undefined): string => {
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  return v === undefined || v === '' ? '—' : String(v);
};

const AddEntrySheet = ({ register, onClose }: { register: RegisterDef; onClose: () => void }) => {
  const { addEntry } = useRegisters();
  const { user } = useSession();
  const toast = useToast();

  const [draft, setDraft] = useState<EntryValues>(() => {
    const seed: EntryValues = {};
    register.fields.forEach((f) => {
      if (f.type === 'section') return;
      seed[f.id] = f.type === 'multiselect' ? [] : f.type === 'checkbox' ? false : '';
    });
    return seed;
  });

  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [edited, setEdited] = useState(false);
  const summary = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  useEffect(() => { if (issues.length || reviewing) summary.current?.focus(); }, [issues, reviewing]);
  const review = () => {
    const errors = validateRegisterEntry(register.fields, draft);
    setIssues(errors);
    if (!errors.length) setReviewing(true);
  };

  const save = async () => {
    if (savingRef.current || !reviewing) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const issues = await addEntry(register.id, { values: draft });
      if (issues.length > 0) {
        setIssues(issues); setReviewing(false);
        return;
      }
      toast(`Entry saved & locked — recorded by ${user.name}`);
      onClose();
    } catch (cause) { setIssues([cause instanceof Error ? cause.message : 'Could not save the entry. Try again.']); }
    finally { savingRef.current = false; setSaving(false); }
  };

  return (
    <Sheet onClose={onClose} closeDisabled={saving} hasUnsavedChanges={edited} eyebrow={`${register.category} · New entry`} title={reviewing ? `Review · ${register.name}` : register.name}>
      {issues.length ? <div ref={summary} tabIndex={-1} role="alert" className="mb-4 rounded-field border border-danger bg-danger-bg p-4 text-sm text-danger"><p className="font-bold">Check this entry</p><ul className="mt-2 list-disc pl-5">{issues.map((issue) => <li key={issue}>{issue}</li>)}</ul></div> : null}
      {reviewing ? <div ref={summary} tabIndex={-1} className="space-y-4 outline-none"><p className="text-sm text-ink-muted">Check the answers before signing. The saved entry is permanent and attributed to {user.name}.</p><dl className="divide-y divide-outline-soft">{register.fields.filter((field) => field.type !== 'section').map((field) => <div key={field.id} className="py-3"><dt className="text-xs font-bold text-ink-muted">{field.label}</dt><dd className="mt-1 break-words text-sm">{fmtCell(draft[field.id])}</dd></div>)}</dl></div> : <div className="flex flex-col gap-4">
        {register.fields.map((f) => (
          <RegisterField
            key={f.id}
            field={f}
            value={draft[f.id]}
            error={issues.length ? validateRegisterEntry([f], draft)[0] : undefined}
            onChange={(v) => { const next = { ...draft, [f.id]: v }; setEdited(true); setDraft(next); if (issues.length) setIssues(validateRegisterEntry(register.fields, next)); }}
          />
        ))}
      </div>}
      <div className="mt-5 flex flex-wrap gap-2.5">
        <Button variant="primary" fullWidth={false} className="flex-1" loading={saving} onClick={reviewing ? save : review}>
          {reviewing ? 'Sign & save entry' : 'Review entry'}
        </Button>
        {reviewing ? <Button variant="outlined" fullWidth={false} className="px-6" disabled={saving} onClick={() => setReviewing(false)}>Keep editing</Button> : <SheetCancelButton disabled={saving} />}
      </div>
    </Sheet>
  );
};

/** A register's append-only logbook — every entry locked to its recorder (PRD §9.4 / §9.8.3). */
export const RegisterEntriesScreen = () => {
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const { getById, loading, error, reload } = useRegisters();
  const context = useAuthorizationContext();
  const register = getById(id);
  useEffect(() => { document.title = `${register?.name ?? 'Register'} · Geneus Health`; }, [register?.name]);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  if (loading && !register) {
    return (
      <div className="min-h-screen bg-surface px-5 py-8 md:px-8">
        <div className="h-8 w-48 animate-pulse rounded-md bg-surface-muted" />
        <div className="mt-5 h-40 animate-pulse rounded-card bg-surface-muted" />
      </div>
    );
  }

  if (error) return <div role="alert" className="p-5">Registers could not be read from this device.<Button variant="ghost" onClick={reload}>Try again</Button></div>;

  if (!register) {
    return (
      <div className="min-h-screen bg-surface px-5 py-8 md:px-8">
        <button type="button" onClick={() => navigate('/registers')} className="text-[14px] font-bold text-brand">‹ All registers</button>
        <p className="mt-6 text-ink-muted">Register not found.</p>
      </div>
    );
  }

  const fieldMap = new Map(register.fields.filter((field) => field.type !== 'section').map((field) => [field.id, field]));
  for (const row of register.rows) for (const field of row.fields) if (field.type !== 'section' && !fieldMap.has(field.id)) fieldMap.set(field.id, field);
  const columns = [...fieldMap.values()];
  const shown = register.rows.filter((row) => (!from || row.entryDate >= from) && (!to || row.entryDate <= to) && (row.by + ' ' + Object.values(row.values).map(fmtCell).join(' ')).toLowerCase().includes(search.toLowerCase()));
  const exportEntries = () => downloadCsv('register-' + register.id.replace(/[^a-z0-9-]/gi, '-') + '.csv', [['Entry ID', 'Entry date', 'Version', 'Recorded by', 'Field', 'Value'], ...shown.flatMap((row) => row.fields.filter((field) => field.type !== 'section').map((field) => [row.id, row.entryDate, row.registerVersion, row.by, field.label, fmtCell(row.values[field.id])]))]);

  return (
    <div className="min-h-screen bg-surface">
      <div className="w-full px-5 py-4 md:px-8">
        <button type="button" onClick={() => navigate('/registers')} className="mb-3 inline-flex items-center gap-1.5 text-[14px] font-bold text-brand">
          <Icon name="back" className="h-4 w-4" /> All registers
        </button>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[12px] uppercase tracking-[0.16em] text-brand-strong">{register.category} · Register</div>
            <h1 className="mt-1.5 text-[24px] font-extrabold tracking-[-0.02em] md:text-[28px]">{register.name}</h1>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {context.permissions.includes('register_definition:publish') ? <Button variant="outlined" fullWidth={false} className="px-4" onClick={() => navigate(`/registers/${register.id}/configure`)}>Configure</Button> : null}
            {context.permissions.includes('register_entry:create') ? <Button variant="primary" fullWidth={false} className="px-4" onClick={() => setAdding(true)}>＋ Add entry</Button> : null}
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3"><TextField label="Search entries" type="search" value={search} onChange={(event) => setSearch(event.target.value)} /><TextField label="Entries from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><TextField label="Entries to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
        {from && to && from > to ? <p role="alert" className="mt-2 text-sm text-danger">The end date must be on or after the start date.</p> : null}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-ink-muted">{shown.length} of {register.rows.length} entries · current version {register.version}</p><Button variant="outlined" fullWidth={false} disabled={!shown.length} onClick={exportEntries}>Export shown entries</Button></div>
        {register.rows.length > 0 ? (
          <>
            {!shown.length ? <p className="mt-4 text-sm text-ink-muted">No entries match these filters.</p> : null}
            <div className="mt-5 space-y-2 lg:hidden">
              {shown.map((row, index) => <details key={row.id} className="rounded-card border border-outline-soft bg-white p-4">
                <summary className="cursor-pointer text-[14px] font-semibold text-ink">
                  Entry {register.rows.length - index} · {row.when}
                  <span className="mt-1 block text-[13px] font-normal text-ink-muted">{row.fields.filter((field) => field.type !== 'section').slice(0, 2).map((field) => `${field.label}: ${fmtCell(row.values[field.id])}`).join(' · ')}</span>
                </summary>
                <dl className="mt-4 space-y-3">{row.fields.filter((field) => field.type !== 'section').map((field) => <div key={field.id}><dt className="text-[12px] font-semibold text-ink-muted">{field.label || 'Field'}</dt><dd className="mt-1 break-words text-sm">{fmtCell(row.values[field.id])}</dd></div>)}</dl>
                <p className="mt-4 border-t border-outline-soft pt-3 text-xs text-ink-muted">Recorded by {row.by} · {row.when}</p>
              </details>)}
            </div>
            <div className="mt-5 hidden overflow-hidden rounded-card border border-outline-soft bg-white lg:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <caption className="sr-only">{register.name} entries</caption>
                  <thead>
                    <tr className="bg-brand-wash text-left text-[11px] font-extrabold uppercase tracking-[0.04em] text-brand-strong">
                      <th scope="col" className="whitespace-nowrap px-3.5 py-3">#</th>
                      {columns.map((c) => (
                        <th scope="col" key={c.id} className="whitespace-nowrap px-3.5 py-3">{c.label || 'Field'}</th>
                      ))}
                      <th scope="col" className="whitespace-nowrap px-3.5 py-3">Recorded by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((row, i) => (
                      <tr key={row.id} className="border-t border-outline-soft align-top">
                        <td className="whitespace-nowrap px-3.5 py-3 font-mono text-xs text-ink-muted">
                          {String(register.rows.length - i).padStart(3, '0')}
                        </td>
                        {columns.map((c) => (
                          <td key={c.id} className="whitespace-nowrap px-3.5 py-3 text-ink">{row.registerVersion !== register.version ? <span className="mb-1 block text-xs text-ink-muted">{row.fields.find((field) => field.id === c.id)?.label ?? 'Not in this version'}</span> : null}{fmtCell(row.values[c.id])}</td>
                        ))}
                        <td className="whitespace-nowrap px-3.5 py-3">
                          <div className="text-[13px] font-semibold text-ink-soft">{row.by}</div><p className="text-xs text-ink-muted">Version {row.registerVersion}</p>
                          <div className="mt-0.5 inline-flex items-center gap-1 font-mono text-[11px] text-ink-muted">
                            <Icon name="lock" className="h-3 w-3" /> {row.when}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="mt-3.5 max-w-[70ch] pb-24 text-xs leading-relaxed text-ink-muted">
              Entries are append-only. Each row is locked to the staff member who recorded it and the time it was saved —
              corrections are added as a new entry, never overwritten.
            </p>
          </>
        ) : (
          <div className="mt-5 rounded-card border border-dashed border-outline p-10 text-center">
            <div className="text-[15px] font-bold text-ink-soft">No entries yet</div>
            <div className="mt-1.5 text-[13px] text-ink-muted">Record the first entry against this register.</div>
            <div className="mt-4">
              {context.permissions.includes('register_entry:create') ? <Button variant="primary" fullWidth={false} className="px-5" onClick={() => setAdding(true)}>＋ Add entry</Button> : null}
            </div>
          </div>
        )}
      </div>

      {adding ? <AddEntrySheet register={register} onClose={() => setAdding(false)} /> : null}
    </div>
  );
};
