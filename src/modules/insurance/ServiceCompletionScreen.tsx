import { useCallback, useEffect, useState } from 'react';
import { COMPLETION_ROLES, type ServiceCompletion } from '@shared';
import { useLiveQuery } from '@/data';
import { completionWork, recordCompletion, type CompletionItem } from '@/data/repos/insurance';
import { useAuthorizationContext } from '@/session';
import { Button, TextAreaField, TextField, useToast } from '@/ui';
import { useInsuranceSupported } from './CoverCard';

const TABLES = ['charge', 'coverage_allocation', 'service_completion', 'encounter_entry', 'encounter', 'patient'] as const;
const pad = (n: number) => String(n).padStart(2, '0');
const localNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const describe = (item: CompletionItem) => {
  const f = item.fulfillment;
  switch (f.kind) {
    case 'missing': return f.ordered ? 'Ordered — no result or supply recorded' : 'Not yet recorded as done';
    case 'not_done': return `Recorded as not done: ${f.reason}`;
    case 'completion': return `Recorded as done ${new Date(f.on).toLocaleString('en-GB')}`;
    case 'result': return 'Result recorded';
    case 'dispense': return 'Supplied';
    case 'visit': return 'Seen by a clinician';
    case 'administrative': return 'Administrative';
  }
};

/**
 * Insured services the payer will be asked to pay for, where no clinical
 * record yet shows they were done. The clinician who did the work records
 * it here — or that it was not done. Insurance staff cannot record this.
 */
export const ServiceCompletionScreen = () => {
  const context = useAuthorizationContext();
  const supported = useInsuranceSupported();
  const [all, setAll] = useState(false);
  useEffect(() => { document.title = 'Service completion · Geneus Health'; }, []);
  const work = useLiveQuery(useCallback(() => completionWork(), []), TABLES);
  if (!supported) return <main className="p-4"><h1 className="text-xl font-bold">Service completion</h1><p className="mt-2 text-sm">Insurance is not enabled for this hospital.</p></main>;
  const canRecord = (COMPLETION_ROLES as readonly string[]).includes(context.role) && context.permissions.includes('encounter:record');
  const items = (work.data ?? []).filter((i) => all || i.fulfillment.kind === 'missing' || i.fulfillment.kind === 'not_done' || i.fulfillment.kind === 'completion');
  const open = items.filter((i) => i.fulfillment.kind === 'missing').length;
  return <main className="mx-auto max-w-4xl space-y-4 p-4">
    <header><h1 className="text-2xl font-extrabold">Service completion</h1>
      <p className="text-sm text-ink-soft">Record that an insured service was done, or not done, where no result, supply or visit entry shows it. Claims to the payer include only services shown as done.</p></header>
    {!canRecord ? <p role="alert" className="rounded-field border border-amber-border bg-amber-bg p-3 text-sm">Only clinical staff, signed in as the role that did the work, can record this.</p> : null}
    <div className="flex flex-wrap items-center gap-3 text-sm"><span role="status"><strong>{open}</strong> service{open === 1 ? '' : 's'} waiting to be recorded</span>
      <label className="flex min-h-[44px] items-center gap-2"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />Show services already shown as done</label></div>
    {!work.data ? <p role="status">Loading…</p> : items.length === 0 ? <p className="text-sm">Nothing to record.</p>
      : <ul className="space-y-2">{items.map((item) => <CompletionRow key={item.charge.id} item={item} canRecord={canRecord} />)}</ul>}
  </main>;
};

const CompletionRow = ({ item, canRecord }: { item: CompletionItem; canRecord: boolean }) => {
  const context = useAuthorizationContext();
  const toast = useToast();
  const [mode, setMode] = useState<ServiceCompletion['status']>();
  const [when, setWhen] = useState(localNow()); const [note, setNote] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const recordable = item.fulfillment.kind === 'missing' || item.fulfillment.kind === 'not_done' || item.fulfillment.kind === 'completion';
  const save = async () => {
    if (mode === 'not_done' && !note.trim()) { setError('Say why it was not done'); return; }
    const at = new Date(when);
    if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 60_000) { setError('Choose when it was done — not in the future'); return; }
    setBusy(true); setError('');
    try {
      await recordCompletion({ patientId: item.charge.patientId, chargeId: item.charge.id, status: mode!, completedOn: at.toISOString(), note, ...(item.completion ? { replaces: item.completion.id } : {}) }, context);
      toast(mode === 'completed' ? 'Recorded as done.' : 'Recorded as not done.'); setMode(undefined); setNote('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save'); } finally { setBusy(false); }
  };
  return <li data-charge={item.charge.id} className="space-y-2 rounded-card border border-outline-soft bg-white p-3 text-sm">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div><p className="font-semibold">{item.charge.description}</p><p className="text-ink-soft">{item.patientName} · raised {new Date(item.charge.createdOn).toLocaleString('en-GB')}</p>
        <p className={item.fulfillment.kind === 'missing' || item.fulfillment.kind === 'not_done' ? 'text-amber-text' : 'text-success'}>{describe(item)}</p></div>
      {canRecord && recordable && !mode ? <div className="flex flex-wrap gap-2">
        <Button fullWidth={false} variant="outlined" onClick={() => setMode('completed')}>{item.completion ? 'Correct: done' : 'Record as done'}</Button>
        <Button fullWidth={false} variant="ghost" onClick={() => setMode('not_done')}>{item.completion ? 'Correct: not done' : 'Not done'}</Button>
      </div> : null}
    </div>
    {mode ? <form aria-label={`Record service ${item.charge.description}`} className="space-y-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <TextField label={mode === 'completed' ? 'Done at' : 'Checked at'} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
      <TextAreaField label={mode === 'completed' ? 'Note (optional)' : 'Why it was not done'} value={note} onChange={(e) => setNote(e.target.value)} />
      {error ? <p role="alert" className="text-danger">{error}</p> : null}
      <div className="flex gap-2"><Button type="submit" fullWidth={false} loading={busy}>Save</Button><Button type="button" variant="ghost" fullWidth={false} onClick={() => setMode(undefined)}>Cancel</Button></div>
    </form> : null}
  </li>;
};
