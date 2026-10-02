import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Icon, Sheet, useToast } from '@/ui';
import { useSession } from '@/session';
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

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const issues = await addEntry(register.id, { values: draft });
      if (issues.length > 0) {
        toast(issues[0]);
        setSaving(false);
        return;
      }
      toast(`Entry saved & locked — recorded by ${user.name}`);
      onClose();
    } catch {
      toast('Could not save the entry — please try again');
      setSaving(false);
    }
  };

  return (
    <Sheet onClose={onClose} eyebrow={`${register.category} · New entry`} title={register.name}>
      <div className="flex flex-col gap-4">
        {register.fields.map((f) => (
          <RegisterField
            key={f.id}
            field={f}
            value={draft[f.id]}
            onChange={(v) => setDraft((d) => ({ ...d, [f.id]: v }))}
          />
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-2.5">
        <Button variant="primary" fullWidth={false} className="flex-1" loading={saving} onClick={save}>
          Save entry
        </Button>
        <Button variant="outlined" fullWidth={false} className="px-6" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Sheet>
  );
};

/** A register's append-only logbook — every entry locked to its recorder (PRD §9.4 / §9.8.3). */
export const RegisterEntriesScreen = () => {
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const { getById, loading } = useRegisters();
  const register = getById(id);
  const [adding, setAdding] = useState(false);

  if (loading && !register) {
    return (
      <div className="min-h-screen bg-surface px-5 py-8 md:px-8">
        <div className="h-8 w-48 animate-pulse rounded-md bg-surface-muted" />
        <div className="mt-5 h-40 animate-pulse rounded-card bg-surface-muted" />
      </div>
    );
  }

  if (!register) {
    return (
      <div className="min-h-screen bg-surface px-5 py-8 md:px-8">
        <button type="button" onClick={() => navigate('/registers')} className="text-[14px] font-bold text-brand">‹ All registers</button>
        <p className="mt-6 text-ink-muted">Register not found.</p>
      </div>
    );
  }

  const columns = register.fields.filter((f) => f.type !== 'section');

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
            <Button variant="outlined" fullWidth={false} className="px-4" onClick={() => navigate(`/registers/${register.id}/configure`)}>
              Configure
            </Button>
            <Button variant="primary" fullWidth={false} className="px-4" onClick={() => setAdding(true)}>
              ＋ Add entry
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="rounded-[14px] border border-outline-soft bg-white px-4 py-3.5">
            <div className="text-[12px] font-semibold text-ink-muted">Entries</div>
            <div className="mt-2 text-[26px] font-extrabold tracking-[-0.02em]">{register.rows.length}</div>
          </div>
          <div className="rounded-[14px] border border-outline-soft bg-white px-4 py-3.5">
            <div className="text-[12px] font-semibold text-ink-muted">Fields</div>
            <div className="mt-2 text-[26px] font-extrabold tracking-[-0.02em]">{columns.length}</div>
          </div>
          <div className="rounded-[14px] border border-outline-soft bg-white px-4 py-3.5">
            <div className="text-[12px] font-semibold text-ink-muted">Status</div>
            <div className="mt-2 text-[20px] font-extrabold tracking-[-0.02em]">{register.status === 'published' ? 'Published' : 'Draft'}</div>
          </div>
        </div>

        {register.rows.length > 0 ? (
          <>
            <div className="mt-5 overflow-hidden rounded-card border border-outline-soft bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-brand-wash text-left text-[11px] font-extrabold uppercase tracking-[0.04em] text-brand-strong">
                      <th className="whitespace-nowrap px-3.5 py-3">#</th>
                      {columns.map((c) => (
                        <th key={c.id} className="whitespace-nowrap px-3.5 py-3">{c.label || 'Field'}</th>
                      ))}
                      <th className="whitespace-nowrap px-3.5 py-3">Recorded by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {register.rows.map((row, i) => (
                      <tr key={row.id} className="border-t border-outline-soft align-top">
                        <td className="whitespace-nowrap px-3.5 py-3 font-mono text-xs text-ink-muted">
                          {String(register.rows.length - i).padStart(3, '0')}
                        </td>
                        {columns.map((c) => (
                          <td key={c.id} className="whitespace-nowrap px-3.5 py-3 text-ink">{fmtCell(row.values[c.id])}</td>
                        ))}
                        <td className="whitespace-nowrap px-3.5 py-3">
                          <div className="text-[13px] font-semibold text-ink-soft">{row.by}</div>
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
              <Button variant="primary" fullWidth={false} className="px-5" onClick={() => setAdding(true)}>
                ＋ Add entry
              </Button>
            </div>
          </div>
        )}
      </div>

      {adding ? <AddEntrySheet register={register} onClose={() => setAdding(false)} /> : null}
    </div>
  );
};
