import { formatRange, type AgeBound, type ReferenceRange, type ResultPart, type ResultTemplate } from '@shared';

export const STATUS_LABELS: Record<ResultTemplate['status'], string> = { active: 'In use', draft: 'Draft', archived: 'Archived' };
export const STATUS_TONES = { active: 'green', draft: 'amber', archived: 'neutral' } as const satisfies Record<ResultTemplate['status'], string>;

const unitWord = (bound: AgeBound) => bound.value === 1 ? bound.unit.replace(/s$/, '') : bound.unit;
const bound = (b: AgeBound) => `${b.value} ${unitWord(b)}`;
/** "Women, 18 years and over", "Anyone, under 1 month", "Men, 5 to 18 years". */
export const rangeAudience = (range: Pick<ReferenceRange, 'sex' | 'ageFrom' | 'ageTo'>): string => {
  const who = range.sex === 'female' ? 'Women' : range.sex === 'male' ? 'Men' : 'Anyone';
  const age = range.ageFrom && range.ageTo ? `${range.ageFrom.value}${range.ageFrom.unit === range.ageTo.unit ? '' : ` ${unitWord(range.ageFrom)}`} to ${bound(range.ageTo)}`
    : range.ageFrom ? `${bound(range.ageFrom)} and over` : range.ageTo ? `under ${bound(range.ageTo)}` : 'any age';
  return `${who}, ${age}`;
};

/** What a part's normal ranges come to, in one line for a table cell. */
export const rangeSummary = (part: ResultPart): string => {
  if (part.kind !== 'number') return '—';
  if (!part.ranges.length) return 'No range set';
  if (part.ranges.length === 1) return `${formatRange(part.ranges[0])} · ${rangeAudience(part.ranges[0])}`;
  return `${part.ranges.length} ranges`;
};

/** A part key from its label, unique among the keys already taken: "White cell count" → "white_cell_count". */
export const partKeyFor = (label: string, taken: readonly string[]): string => {
  const base = (label.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'p_$1') || 'part').slice(0, 50);
  let key = base, n = 2;
  while (taken.includes(key)) key = `${base}_${n++}`;
  return key;
};
