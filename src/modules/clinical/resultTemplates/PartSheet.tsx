import { useState, type ReactNode } from 'react';
import { RESULT_PART_KIND_LABELS, ResultPart, type AgeUnit, type AnswerList, type ReferenceRange } from '@shared';
import { Button, SelectField, Sheet, SheetCancelButton, TextAreaField, TextField } from '@/ui';
import { partKeyFor } from './labels';

type Kind = ResultPart['kind'];
type RangeRow = { sex: '' | 'male' | 'female'; from: string; fromUnit: AgeUnit; to: string; toUnit: AgeUnit; low: string; high: string };
const UNITS = [{ value: 'years', label: 'years' }, { value: 'months', label: 'months' }, { value: 'days', label: 'days' }];
const KINDS = (Object.keys(RESULT_PART_KIND_LABELS) as Kind[]).map((value) => ({ value, label: RESULT_PART_KIND_LABELS[value] }));
const blankRange: RangeRow = { sex: '', from: '18', fromUnit: 'years', to: '', toUnit: 'years', low: '', high: '' };
const lines = (text: string) => text.split('\n').map((line) => line.trim()).filter(Boolean);
const numberOrUndefined = (text: string) => text.trim() === '' ? undefined : Number(text);

const toRow = (range: ReferenceRange): RangeRow => ({
  sex: range.sex ?? '', from: range.ageFrom ? String(range.ageFrom.value) : '', fromUnit: range.ageFrom?.unit ?? 'years',
  to: range.ageTo ? String(range.ageTo.value) : '', toUnit: range.ageTo?.unit ?? 'years', low: range.low === undefined ? '' : String(range.low), high: range.high === undefined ? '' : String(range.high),
});
const toRange = (row: RangeRow) => ({
  ...(row.sex ? { sex: row.sex } : {}),
  ...(row.from.trim() ? { ageFrom: { value: Number(row.from), unit: row.fromUnit } } : {}),
  ...(row.to.trim() ? { ageTo: { value: Number(row.to), unit: row.toUnit } } : {}),
  ...(row.low.trim() ? { low: Number(row.low) } : {}), ...(row.high.trim() ? { high: Number(row.high) } : {}),
});

/** Explains a refused part in the editor's words, naming the range row when it is one. */
const firstIssue = (issues: { path: PropertyKey[]; message: string }[]) => {
  const issue = issues[0];
  if (!issue) return 'Check this part and try again';
  return issue.path[0] === 'ranges' && typeof issue.path[1] === 'number' ? `Range ${issue.path[1] + 1}: ${issue.message}` : issue.message;
};

type Props = {
  /** The part being edited; absent for a new one. */
  part?: ResultPart;
  /** Keys already used by the other parts of the same template. */
  takenKeys?: readonly string[];
  lists: readonly AnswerList[];
  /** In a template a part can be required; a shared library part cannot. */
  showRequired?: boolean;
  saving?: boolean;
  error?: string;
  onSave: (part: ResultPart) => void;
  onClose: () => void;
};

/**
 * One result part: what it is called, what kind of answer it takes and, for a
 * number, its unit and normal ranges by sex and age. The system shows the range
 * for each patient; it never flags a value.
 */
export const PartSheet = ({ part, takenKeys = [], lists, showRequired = true, saving = false, error: saveError, onSave, onClose }: Props) => {
  const [kind, setKind] = useState<Kind>(part?.kind ?? 'number');
  const [label, setLabel] = useState(part?.label ?? ''), [required, setRequired] = useState(part?.required ?? true);
  const [unit, setUnit] = useState(part?.kind === 'number' ? part.unit ?? '' : ''), [decimals, setDecimals] = useState(part?.kind === 'number' ? String(part.decimals) : '1');
  const [ranges, setRanges] = useState<RangeRow[]>(part?.kind === 'number' ? part.ranges.map(toRow) : []);
  const [answers, setAnswers] = useState(part?.kind === 'choice' ? part.answers.join('\n') : ''), [answerListId, setAnswerListId] = useState(part?.kind === 'choice' ? part.answerListId ?? '' : '');
  const [antibiotics, setAntibiotics] = useState(part?.kind === 'culture' ? part.antibiotics.join('\n') : ''), [maxFiles, setMaxFiles] = useState(part?.kind === 'images' ? String(part.maxFiles) : '6');
  const [error, setError] = useState('');
  const snapshot = JSON.stringify([kind, label, required, unit, decimals, ranges, answers, answerListId, antibiotics, maxFiles]), [initial] = useState(snapshot);
  const list = lists.find((l) => l.id === answerListId);
  const setRange = (index: number, changes: Partial<RangeRow>) => setRanges((current) => current.map((row, i) => i === index ? { ...row, ...changes } : row));

  const save = () => {
    const base = { key: part?.key ?? partKeyFor(label, takenKeys), label: label.trim(), required: showRequired ? required : false };
    const candidate = kind === 'number' ? { ...base, kind, ...(unit.trim() ? { unit: unit.trim() } : {}), decimals: Number(decimals), ranges: ranges.map(toRange) }
      : kind === 'choice' ? { ...base, kind, answers: list ? list.answers : lines(answers), ...(list ? { answerListId: list.id } : {}) }
      : kind === 'culture' ? { ...base, kind, antibiotics: lines(antibiotics) }
      : kind === 'images' ? { ...base, kind, maxFiles: Number(maxFiles) } : { ...base, kind };
    if (ranges.some((row) => [row.from, row.to, row.low, row.high].some((value) => value.trim() && !Number.isFinite(numberOrUndefined(value))))) { setError('Use numbers for ages and range values'); return; }
    const parsed = ResultPart.safeParse(candidate);
    if (!parsed.success) { setError(firstIssue(parsed.error.issues)); return; }
    setError(''); onSave(parsed.data);
  };

  return <Sheet title={part ? part.label : 'New result part'} eyebrow={part ? RESULT_PART_KIND_LABELS[part.kind] : undefined} placement="side" onClose={onClose} hasUnsavedChanges={snapshot !== initial}>
    <div className="space-y-5">
      <TextField label="Part name" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="For example Haemoglobin" />
      {part ? null : <SelectField label="Answer type" value={kind} options={KINDS} onChange={(e) => setKind(e.target.value as Kind)} />}
      {showRequired ? <label className="flex min-h-[44px] items-center gap-3 text-sm font-bold"><input type="checkbox" className="h-5 w-5 min-h-0 accent-brand" checked={required} onChange={(e) => setRequired(e.target.checked)} />The lab must fill this in before publishing</label> : null}

      {kind === 'number' ? <>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Unit (optional)" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="For example g/dL" />
          <SelectField label="Decimal places" value={decimals} options={['0', '1', '2', '3', '4'].map((value) => ({ value, label: value }))} onChange={(e) => setDecimals(e.target.value)} />
        </div>
        <section aria-labelledby="ranges-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="ranges-heading" className="text-lg font-extrabold">Normal ranges</h3><Button variant="outlined" fullWidth={false} className="px-3 text-sm" onClick={() => setRanges([...ranges, { ...blankRange, from: ranges.length ? '' : '18' }])}>Add range</Button></div>
          <p className="text-sm text-ink-soft">The doctor sees the range that matches the patient's sex and age on the day the result is published. "Age to" is not included: 5 to 18 years ends the day before the 18th birthday. Leave both ages empty for any age.</p>
          {ranges.length ? <ol className="space-y-3">{ranges.map((row, index) => {
            const n = index + 1, cell = 'min-h-[44px] w-full min-w-0 rounded-field border border-outline bg-white px-2 text-base';
            const field = (label: string, control: ReactNode) => <label className="block min-w-0 text-xs font-bold text-ink-soft">{label}<span className="mt-1 block">{control}</span></label>;
            const units = (name: string, value: AgeUnit, change: (unit: AgeUnit) => void) => <select aria-label={name} className={cell} value={value} onChange={(e) => change(e.target.value as AgeUnit)}>{UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select>;
            return <li key={index} className="space-y-3 rounded-field border border-outline-soft p-3">
              <div className="flex items-center justify-between gap-2"><p className="text-sm font-bold">Range {n}</p><Button variant="ghost" fullWidth={false} aria-label={`Remove range ${n}`} className="w-11 px-0" onClick={() => setRanges(ranges.filter((_, i) => i !== index))}>✕</Button></div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2">{field('For', <select aria-label={`Range ${n} for`} className={cell} value={row.sex} onChange={(e) => setRange(index, { sex: e.target.value as RangeRow['sex'] })}><option value="">Anyone</option><option value="female">Women</option><option value="male">Men</option></select>)}</div>
                {field('Low', <input aria-label={`Range ${n} low`} inputMode="decimal" className={cell} value={row.low} onChange={(e) => setRange(index, { low: e.target.value })} />)}
                {field('High', <input aria-label={`Range ${n} high`} inputMode="decimal" className={cell} value={row.high} onChange={(e) => setRange(index, { high: e.target.value })} />)}
                {field('Age from', <input aria-label={`Range ${n} age from`} inputMode="numeric" placeholder="Birth" className={cell} value={row.from} onChange={(e) => setRange(index, { from: e.target.value })} />)}
                {field('Unit', units(`Range ${n} age from unit`, row.fromUnit, (unit) => setRange(index, { fromUnit: unit })))}
                {field('Age to', <input aria-label={`Range ${n} age to`} inputMode="numeric" placeholder="No limit" className={cell} value={row.to} onChange={(e) => setRange(index, { to: e.target.value })} />)}
                {field('Unit', units(`Range ${n} age to unit`, row.toUnit, (unit) => setRange(index, { toUnit: unit })))}
              </div>
            </li>;
          })}</ol> : <p className="rounded-field border border-dashed border-outline p-4 text-sm">No normal range. Results for this part show the value only.</p>}
          <p className="rounded-field bg-surface p-3 text-sm text-ink-soft">If the patient's sex or age isn't recorded, or no row fits them, the result shows "No range set for this patient". The lab scientist can still add a flag.</p>
        </section>
      </> : null}

      {kind === 'choice' ? <>
        {lists.length ? <SelectField label="Answers come from" value={answerListId} options={[{ value: '', label: 'Answers typed here' }, ...lists.filter((l) => l.active || l.id === answerListId).map((l) => ({ value: l.id, label: `Answer list: ${l.name}` }))]} onChange={(e) => setAnswerListId(e.target.value)} /> : null}
        {list ? <p className="rounded-field bg-surface p-3 text-sm">{list.answers.join(' · ')}<span className="block text-ink-soft">Changing the answer list updates this part too.</span></p>
          : <div className="space-y-1"><TextAreaField label="Answers" rows={5} value={answers} onChange={(e) => setAnswers(e.target.value)} /><p className="text-sm text-ink-soft">One answer per line, in the order the lab should see them.</p></div>}
      </> : null}
      {kind === 'culture' ? <div className="space-y-1"><TextAreaField label="Antibiotics tested" rows={8} value={antibiotics} onChange={(e) => setAntibiotics(e.target.value)} /><p className="text-sm text-ink-soft">One antibiotic per line. For each organism grown, the lab records S, I or R against these.</p></div> : null}
      {kind === 'images' ? <SelectField label="Most files the lab can attach" value={maxFiles} options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} onChange={(e) => setMaxFiles(e.target.value)} /> : null}
      {kind === 'text' || kind === 'section' ? <p className="text-sm text-ink-soft">{kind === 'section' ? 'A titled block of report text, such as Findings or Impression.' : 'A short written answer.'}</p> : null}

      {error || saveError ? <p role="alert" className="text-danger-strong">{error || saveError}</p> : null}
      <div className="flex flex-wrap gap-2"><SheetCancelButton /><Button fullWidth={false} loading={saving} disabled={saving || !label.trim()} onClick={save}>{part ? 'Save part' : 'Add part'}</Button></div>
    </div>
  </Sheet>;
};
