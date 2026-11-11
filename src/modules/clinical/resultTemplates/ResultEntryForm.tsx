import { useState } from 'react';
import { DOCUMENT_ACCEPT, RESULT_FLAG_LABELS, formatRange, rangeFor, type LabPatientFacts, type ResultFlag, type ResultPart, type ResultTemplate } from '@shared';
import { documentScope, stageDocumentFile } from '@/data/documentFiles';
import { useAuthorizationContext } from '@/session';
import { Button, TextAreaField } from '@/ui';
import type { LabItemDraft, LabPartDraft } from '@/modules/clinical/encounter/types';
import { factsLabel } from './labEntry';

const FLAGS: { value: '' | ResultFlag; label: string }[] = [{ value: '', label: 'No flag' }, ...(Object.keys(RESULT_FLAG_LABELS) as ResultFlag[]).map((value) => ({ value, label: RESULT_FLAG_LABELS[value] }))];
const control = 'min-h-[48px] w-full min-w-0 rounded-field border border-outline bg-white px-3 text-base';
const blank: LabItemDraft = { values: {}, comment: '' };

const FlagSelect = ({ label, value, onChange }: { label: string; value?: string; onChange: (flag: '' | ResultFlag) => void }) =>
  <label className="block min-w-0 text-xs font-bold text-ink-soft">Flag (optional)<select aria-label={`Flag for ${label}`} className={`${control} mt-1`} value={value ?? ''} onChange={(e) => onChange(e.target.value as '' | ResultFlag)}>{FLAGS.map((flag) => <option key={flag.value} value={flag.value}>{flag.label}</option>)}</select></label>;

const CultureInput = ({ part, draft, change }: { part: Extract<ResultPart, { kind: 'culture' }>; draft: LabPartDraft; change: (patch: Partial<LabPartDraft>) => void }) => {
  const organisms = draft.organisms ?? [];
  const setOrganism = (index: number, patch: Partial<NonNullable<LabPartDraft['organisms']>[number]>) => change({ organisms: organisms.map((o, i) => i === index ? { ...o, ...patch } : o) });
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block min-w-0 text-xs font-bold text-ink-soft">Growth<select aria-label={`${part.label} growth`} className={`${control} mt-1`} value={draft.growth ?? ''} onChange={(e) => change({ growth: e.target.value as LabPartDraft['growth'], ...(e.target.value === 'growth' && !organisms.length ? { organisms: [{ name: '', count: '', susceptibility: {} }] } : {}) })}><option value="">Not recorded</option><option value="no_growth">No growth</option><option value="growth">Growth</option></select></label>
      <FlagSelect label={part.label} value={draft.flag} onChange={(flag) => change({ flag })} />
    </div>
    {draft.growth === 'growth' ? <>{organisms.map((organism, index) => <fieldset key={index} className="space-y-3 rounded-field border border-outline-soft p-3">
      <legend className="px-1 text-sm font-bold">Organism {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0 text-xs font-bold text-ink-soft">Organism<input aria-label={`Organism ${index + 1} name`} className={`${control} mt-1`} value={organism.name} onChange={(e) => setOrganism(index, { name: e.target.value })} /></label>
        <label className="block min-w-0 text-xs font-bold text-ink-soft">Count (optional)<input aria-label={`Organism ${index + 1} count`} placeholder="For example more than 10⁵ CFU/mL" className={`${control} mt-1`} value={organism.count} onChange={(e) => setOrganism(index, { count: e.target.value })} /></label>
      </div>
      <p className="text-xs font-bold text-ink-soft">Sensitivity (S sensitive · I intermediate · R resistant)</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{part.antibiotics.map((antibiotic) => <label key={antibiotic} className="flex min-w-0 items-center justify-between gap-2 text-sm"><span className="min-w-0 truncate">{antibiotic}</span>
        <select aria-label={`Organism ${index + 1} ${antibiotic}`} className="min-h-[44px] w-20 shrink-0 rounded-field border border-outline bg-white px-2" value={organism.susceptibility[antibiotic] ?? ''} onChange={(e) => setOrganism(index, { susceptibility: { ...organism.susceptibility, [antibiotic]: e.target.value as '' | 'S' | 'I' | 'R' } })}><option value="">—</option><option>S</option><option>I</option><option>R</option></select></label>)}</div>
      {organisms.length > 1 ? <Button variant="ghost" fullWidth={false} onClick={() => change({ organisms: organisms.filter((_, i) => i !== index) })}>Remove organism {index + 1}</Button> : null}
    </fieldset>)}
      <Button variant="outlined" fullWidth={false} onClick={() => change({ organisms: [...organisms, { name: '', count: '', susceptibility: {} }] })}>Add another organism</Button></> : null}
  </div>;
};

const ImagesInput = ({ part, draft, change }: { part: Extract<ResultPart, { kind: 'images' }>; draft: LabPartDraft; change: (patch: Partial<LabPartDraft>) => void }) => {
  const context = useAuthorizationContext(), files = draft.files ?? [];
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const add = async (chosen: FileList | null) => {
    if (!chosen?.length) return;
    setBusy(true); setError('');
    try {
      const staged = [];
      for (const file of [...chosen].slice(0, part.maxFiles - files.length)) staged.push(await stageDocumentFile(documentScope(context), file));
      change({ files: [...files, ...staged] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not keep this file'); } finally { setBusy(false); }
  };
  return <div className="space-y-2">
    {files.length ? <ul className="space-y-1">{files.map((file) => <li key={file.id} className="flex items-center justify-between gap-2 rounded-field border border-outline-soft px-3 py-1 text-sm"><span className="min-w-0 truncate">{file.fileName}</span><Button variant="ghost" fullWidth={false} className="w-11 px-0" aria-label={`Remove ${file.fileName}`} onClick={() => change({ files: files.filter((f) => f.id !== file.id) })}>✕</Button></li>)}</ul> : null}
    {files.length < part.maxFiles ? <label className="block text-sm font-bold">Attach images or PDF files<input type="file" multiple accept={DOCUMENT_ACCEPT} disabled={busy} className="mt-2 block w-full text-sm" onChange={(e) => { void add(e.target.files); e.target.value = ''; }} /></label> : null}
    <p className="text-xs text-ink-soft">Up to {part.maxFiles} files, 10 MB each. They are kept on this device and sent when it next syncs.</p>
    {error ? <p role="alert" className="text-sm text-danger-strong">{error}</p> : null}
  </div>;
};

/**
 * One ordered test entered with its result template: each part with the range
 * for this patient beside it, an optional flag the scientist chooses, and a
 * comment for the doctor. The system never flags a value.
 */
export const ResultEntryForm = ({ test, template, draft = blank, facts, onChange }: { test: string; template: ResultTemplate; draft?: LabItemDraft; facts: LabPatientFacts; onChange: (draft: LabItemDraft) => void }) => {
  const change = (key: string, patch: Partial<LabPartDraft>) => onChange({ ...draft, values: { ...draft.values, [key]: { ...draft.values[key], ...patch } } });
  return <section aria-label={test} className="space-y-4 rounded-card border border-outline-soft p-4">
    <div><h3 className="text-lg font-extrabold">{test}</h3><p className="text-xs text-ink-soft">Template: {template.name}</p></div>
    {template.parts.map((part) => {
      const value = draft.values[part.key] ?? {}, set = (patch: Partial<LabPartDraft>) => change(part.key, patch);
      const heading = <p className="text-sm font-bold">{part.label}{part.required ? <span className="font-normal text-ink-soft"> · required</span> : null}</p>;
      if (part.kind === 'culture') return <div key={part.key} className="space-y-2 border-t border-outline-soft pt-3">{heading}<CultureInput part={part} draft={value} change={set} /></div>;
      if (part.kind === 'images') return <div key={part.key} className="space-y-2 border-t border-outline-soft pt-3">{heading}<ImagesInput part={part} draft={value} change={set} /></div>;
      if (part.kind === 'section') return <div key={part.key} className="border-t border-outline-soft pt-3"><TextAreaField label={part.label + (part.required ? ' (required)' : '')} rows={4} value={value.value ?? ''} onChange={(e) => set({ value: e.target.value })} /></div>;
      const range = part.kind === 'number' ? rangeFor(part, facts) : undefined;
      return <div key={part.key} className="space-y-2 border-t border-outline-soft pt-3">
        {heading}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0 text-xs font-bold text-ink-soft">Result{part.kind === 'number' && part.unit ? ` (${part.unit})` : ''}
            {part.kind === 'choice' ? <select aria-label={part.label} className={`${control} mt-1`} value={value.value ?? ''} onChange={(e) => set({ value: e.target.value })}><option value="">Choose an answer</option>{part.answers.map((answer) => <option key={answer}>{answer}</option>)}</select>
              : <input aria-label={part.label} inputMode={part.kind === 'number' ? 'decimal' : undefined} className={`${control} mt-1`} value={value.value ?? ''} onChange={(e) => set({ value: e.target.value })} />}
          </label>
          <FlagSelect label={part.label} value={value.flag} onChange={(flag) => set({ flag })} />
        </div>
        {part.kind === 'number' ? <p className="text-xs text-ink-soft">{range ? `Normal range (${factsLabel(facts)}): ${formatRange(range)}${part.unit ? ` ${part.unit}` : ''}` : 'No range set for this patient'}</p> : null}
      </div>;
    })}
    <TextAreaField label="Comment for the doctor (optional)" rows={2} value={draft.comment} onChange={(e) => onChange({ ...draft, comment: e.target.value })} />
  </section>;
};
