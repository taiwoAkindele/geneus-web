import { useEffect, useMemo, useState } from 'react';
import { VISIT_TYPE_NAMES, type VisitRegisterRow } from '@shared';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, DataTable, Icon, Tag, TextField, type TableColumn } from '@/ui';
import { calendarDate } from '@/lib/calendarDate';
import { downloadCsv } from '@/lib/csv';
import { useAuthorizationContext } from '@/session';
import { RegisterEntrySheet, fmtCell, useRegisters, useVisitRegister, type RegisterDef } from '@/modules/reports/registers';

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

  if (register.visitLink) return <VisitRegister register={register} />;

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

      {adding ? <RegisterEntrySheet register={register} onClose={() => setAdding(false)} /> : null}
    </div>
  );
};

const monthLabel = (month: string) => new Date(month + '-01T12:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/**
 * A register filled from visits: one row per matching visit, worked out on this
 * device. Staff complete only the fields a visit does not record.
 */
const VisitRegister = ({ register }: { register: RegisterDef }) => {
  const navigate = useNavigate(), context = useAuthorizationContext();
  const visits = useVisitRegister(register);
  const [month, setMonth] = useState(() => calendarDate().slice(0, 7)), [search, setSearch] = useState(''), [page, setPage] = useState(0);
  const [completing, setCompleting] = useState<VisitRegisterRow>();
  const fields = register.fields.filter((field) => field.type !== 'section');
  const asked = fields.filter((field) => !field.fromVisit), canComplete = context.permissions.includes('register_entry:create');
  const inMonth = useMemo(() => visits.rows.filter((row) => !month || row.visitedOn.startsWith(month)), [visits.rows, month]);
  // Numbered like the book: the month's first visit is number 1.
  const serial = useMemo(() => new Map(inMonth.map((row, index) => [row.encounterId, inMonth.length - index])), [inMonth]);
  const query = search.trim().toLowerCase();
  const shown = inMonth.filter((row) => !query || Object.values(row.values).map(fmtCell).join(' ').toLowerCase().includes(query));
  const open = inMonth.filter((row) => !row.complete).length;
  const link = register.visitLink!;
  const columns: TableColumn<VisitRegisterRow>[] = [
    { key: 'serial', label: 'No.', render: (row) => <span className="font-mono text-xs text-ink-muted">{String(serial.get(row.encounterId) ?? '').padStart(3, '0')}</span> },
    // Kept beside the number so it stays in view however wide the register is.
    ...(asked.length ? [{ key: 'complete', label: 'Staff fields', render: (row: VisitRegisterRow) => canComplete
      ? <Button variant={row.complete ? 'outlined' : 'primary'} fullWidth={false} className="px-3 text-sm" onClick={() => setCompleting(row)}>{row.complete ? 'Edit' : 'Complete'}</Button>
      : <Tag tone={row.complete ? 'green' : 'amber'}>{row.complete ? 'Completed' : 'To complete'}</Tag> }] : []),
    ...fields.map((field): TableColumn<VisitRegisterRow> => ({ key: field.id, label: field.label, render: (row) => <span className={`block max-w-[260px] whitespace-pre-wrap break-words ${field.fromVisit ? '' : 'text-brand-strong'}`}>{fmtCell(row.values[field.id])}</span> })),
  ];
  const exportRows = () => downloadCsv('register-' + register.id.replace(/[^a-z0-9-]/gi, '-') + '-' + (month || 'all') + '.csv', [['No.', ...fields.map((field) => field.label)], ...shown.map((row) => [String(serial.get(row.encounterId) ?? ''), ...fields.map((field) => fmtCell(row.values[field.id]))])]);
  const matching = [...link.words, ...link.codes.map((code) => 'code ' + code)].join(', ');
  return <div className="min-h-screen bg-surface">
    <div className="w-full space-y-4 px-5 py-4 pb-24 md:px-8">
      <button type="button" onClick={() => navigate('/registers')} className="inline-flex items-center gap-1.5 text-[14px] font-bold text-brand"><Icon name="back" className="h-4 w-4" /> All registers</button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[12px] uppercase tracking-[0.16em] text-brand-strong">{register.category} · Filled from visits</div>
          <h1 className="mt-1.5 text-[24px] font-extrabold tracking-[-0.02em] md:text-[28px]">{register.name}</h1>
          <p className="mt-1 max-w-[70ch] text-sm text-ink-soft">{link.visits === 'every' ? 'Every visit adds a row.' : link.visits === 'visit_types' ? `Every ${link.visitTypes.map((type) => VISIT_TYPE_NAMES[type].toLowerCase()).join(' or ')} visit adds a row.` : `Visits whose diagnosis, tests or results mention ${matching}.`} Rows update as results, diagnoses and treatment are recorded.</p>
        </div>
        {context.permissions.includes('register_definition:publish') ? <Button variant="outlined" fullWidth={false} className="px-4" onClick={() => navigate(`/registers/${encodeURIComponent(register.id)}/configure`)}>Configure</Button> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2"><TextField label="Month" type="month" value={month} onChange={(event) => { setMonth(event.target.value); setPage(0); }} /><TextField label="Search this register" type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></div>
      <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-sm text-ink-muted">{visits.loading ? 'Reading visits…' : `${inMonth.length} ${inMonth.length === 1 ? 'visit' : 'visits'}${month ? ' in ' + monthLabel(month) : ''}${asked.length ? ` · ${open} to complete` : ''}`}</p><Button variant="outlined" fullWidth={false} disabled={!shown.length} onClick={exportRows}>Export shown rows</Button></div>
      {visits.error ? <div role="alert"><p>Visits could not be read on this device.</p><Button variant="ghost" fullWidth={false} onClick={visits.reload}>Try again</Button></div>
        : shown.length ? <DataTable caption={`${register.name} rows`} rows={shown} rowKey={(row) => row.encounterId} page={page} onPageChange={setPage} columns={columns} />
        : visits.loading ? null : <p className="rounded-card border border-dashed border-outline p-6 text-sm text-ink-soft">{query ? 'No rows match this search.' : `No visits${month ? ' in ' + monthLabel(month) : ''} fill this register yet.`}</p>}
      {asked.length ? <p className="max-w-[70ch] text-xs leading-relaxed text-ink-muted">Fields shown in green are recorded by staff; the visit fills the rest. A change is saved as a new entry attributed to whoever made it.</p> : null}
    </div>
    {completing ? <RegisterEntrySheet key={completing.encounterId} register={register} visit={{ encounterId: completing.encounterId, patientId: completing.patientId, completion: completing.completion, values: completing.values }} onClose={() => setCompleting(undefined)} /> : null}
  </div>;
};
