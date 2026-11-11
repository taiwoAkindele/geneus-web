/**
 * Date ranges as local calendar dates (YYYY-MM-DD), for filters. Blank ends are
 * open: no `from` means "from the beginning", no `to` means "onwards".
 */
export type DatePreset = 'today' | 'last7' | 'next7' | 'thisMonth' | 'next30';

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today', last7: 'Last 7 days', next7: 'Next 7 days', thisMonth: 'This month', next30: 'Next 30 days',
};

const parse = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const shift = (day: string, days: number) => { const date = parse(day); date.setDate(date.getDate() + days); return iso(date); };

/** The range a quick choice stands for, counted from `today` (inclusive at both ends). */
export const presetRange = (preset: DatePreset, today: string): { from: string; to: string } => {
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'last7') return { from: shift(today, -6), to: today };
  if (preset === 'next7') return { from: today, to: shift(today, 6) };
  if (preset === 'next30') return { from: today, to: shift(today, 29) };
  const start = parse(today);
  return { from: iso(new Date(start.getFullYear(), start.getMonth(), 1)), to: iso(new Date(start.getFullYear(), start.getMonth() + 1, 0)) };
};

/** Which quick choice, if any, exactly matches a range. */
export const matchingPreset = (from: string, to: string, today: string, presets: readonly DatePreset[]): DatePreset | undefined =>
  presets.find((preset) => { const range = presetRange(preset, today); return range.from === from && range.to === to; });

const day = (value: string, withYear: boolean) => parse(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });

/** "Any date", "10 Nov 2026", "10 Nov – 16 Nov 2026", "From 10 Nov 2026" or "Until 16 Nov 2026". */
export const formatRange = (from: string, to: string): string => {
  if (!from && !to) return 'Any date';
  if (from && !to) return `From ${day(from, true)}`;
  if (!from && to) return `Until ${day(to, true)}`;
  if (from === to) return day(from, true);
  return `${day(from, from.slice(0, 4) !== to.slice(0, 4))} – ${day(to, true)}`;
};

/** A range is usable when it is open-ended or its end is not before its start. */
export const validRange = (from: string, to: string): boolean => !from || !to || from <= to;

/** Whether a calendar date falls inside a (possibly open) range. */
export const inRange = (value: string, from: string, to: string): boolean => (!from || value >= from) && (!to || value <= to);
