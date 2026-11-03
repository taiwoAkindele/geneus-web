import { useState } from 'react';
import { RESULT_FLAG_LABELS, formatRange, rangeFor, type LabPatientFacts, type ResultPart } from '@shared';

const SAMPLES: { value: string; label: string; facts: LabPatientFacts }[] = [
  { value: 'woman', label: 'a woman aged 30', facts: { sex: 'female', age: { years: 30 } } },
  { value: 'man', label: 'a man aged 30', facts: { sex: 'male', age: { years: 30 } } },
  { value: 'child', label: 'a child aged 8', facts: { sex: 'female', age: { years: 8 } } },
];
const FLAGS = ['No flag', ...Object.values(RESULT_FLAG_LABELS)];
const box = 'min-h-[44px] w-full rounded-field border border-outline bg-surface px-3 text-sm text-ink-soft';
const FlagSelect = ({ label }: { label: string }) => <select disabled aria-label={`Flag for ${label}`} className={box}>{FLAGS.map((flag) => <option key={flag}>{flag}</option>)}</select>;

/**
 * What the lab scientist sees when entering results with this template, as an
 * inert form. Ranges are shown for a sample patient so the ranges table can be
 * checked; no value is ever flagged by the system.
 */
export const ResultPreview = ({ name, parts }: { name: string; parts: readonly ResultPart[] }) => {
  const [sample, setSample] = useState(SAMPLES[0].value);
  const facts = SAMPLES.find((s) => s.value === sample)!.facts;
  return <div className="space-y-4">
    <label className="block text-sm font-bold">Show ranges for
      <select className="mt-2 block min-h-[44px] w-full rounded-field border border-outline bg-white px-3 font-normal" value={sample} onChange={(e) => setSample(e.target.value)}>{SAMPLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
    </label>
    <div className="space-y-4 rounded-field border border-outline-soft bg-surface-muted p-4" aria-label={`Preview of ${name || 'this template'}`}>
      <p className="font-extrabold">{name || 'Untitled template'}</p>
      {parts.length ? parts.map((part) => <div key={part.key} className="space-y-1.5 border-t border-outline-soft pt-3 first:border-0 first:pt-0">
        <p className="text-sm font-bold">{part.label}{part.required ? <span className="text-ink-soft"> · required</span> : null}</p>
        {part.kind === 'number' ? (() => {
          const range = rangeFor(part, facts);
          return <div className="grid gap-2 sm:grid-cols-[1fr_1fr]">
            <input disabled aria-label={part.label} placeholder={part.unit ?? 'Value'} className={box} />
            <FlagSelect label={part.label} />
            <p className="text-xs text-ink-soft sm:col-span-2">{range ? `Normal range: ${formatRange(range)}${part.unit ? ` ${part.unit}` : ''}` : 'No range set for this patient'}</p>
          </div>;
        })() : null}
        {part.kind === 'choice' ? <div className="grid gap-2 sm:grid-cols-[1fr_1fr]"><select disabled aria-label={part.label} className={box}><option>Choose an answer</option>{part.answers.map((answer) => <option key={answer}>{answer}</option>)}</select><FlagSelect label={part.label} /></div> : null}
        {part.kind === 'text' ? <div className="grid gap-2 sm:grid-cols-[1fr_1fr]"><input disabled aria-label={part.label} className={box} /><FlagSelect label={part.label} /></div> : null}
        {part.kind === 'section' ? <textarea disabled aria-label={part.label} rows={3} className={`${box} py-2`} /> : null}
        {part.kind === 'culture' ? <div className="space-y-2"><select disabled aria-label={`${part.label} growth`} className={box}><option>No growth</option><option>Growth</option></select><p className="text-xs text-ink-soft">For each organism grown: S, I or R against {part.antibiotics.length} antibiotics.</p></div> : null}
        {part.kind === 'images' ? <p className="rounded-field border border-dashed border-outline p-3 text-xs text-ink-soft">Attach up to {part.maxFiles} images or PDF files</p> : null}
      </div>) : <p className="text-sm text-ink-soft">Add a part to see the preview.</p>}
    </div>
  </div>;
};
