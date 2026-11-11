import { useEffect, useId, useRef, useState } from 'react';
import { calendarDate } from '@/lib/calendarDate';
import { DATE_PRESET_LABELS, formatRange, matchingPreset, presetRange, validRange, type DatePreset } from '@/lib/dateRange';
import { ChoiceChip } from './ChoiceChip';
import { FieldLabel } from './FieldHelp';
import { Icon } from './Icon';

type Props = {
  label: string;
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  presets?: readonly DatePreset[];
};

/**
 * One control for a date range, sized and labelled like TextField and
 * SelectField so it can sit in a filter row. Quick choices apply at once;
 * typed dates apply when confirmed. Built on native date inputs: no calendar
 * library, works offline and on low-end phones.
 */
export const DateRangeField = ({ label, from, to, onChange, presets = ['today', 'last7', 'next7', 'thisMonth', 'next30'] }: Props) => {
  const id = useId(), panelId = `${id}-panel`;
  const wrapper = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from), [draftTo, setDraftTo] = useState(to);
  const today = calendarDate();
  const active = matchingPreset(from, to, today, presets);
  const draftValid = validRange(draftFrom, draftTo);

  const close = (restoreFocus = true) => { setOpen(false); if (restoreFocus) trigger.current?.focus(); };
  const apply = (nextFrom: string, nextTo: string) => { onChange(nextFrom, nextTo); close(); };
  useEffect(() => { if (open) { setDraftFrom(from); setDraftTo(to); } }, [open, from, to]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!wrapper.current?.contains(event.target as Node)) close(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  return (
    <div ref={wrapper} className="relative" onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.preventDefault(); close(); } }}>
      <FieldLabel label={label} htmlFor={id} />
      <div className="flex items-stretch gap-2">
        <button ref={trigger} id={id} type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-field border-[1.5px] border-outline bg-white px-4 py-3.5 text-left text-base text-ink outline-none focus-visible:border-2 focus-visible:border-brand">
          <Icon name="calendar" className="h-5 w-5 shrink-0 text-ink-soft" />
          <span className="min-w-0 flex-1 truncate">{formatRange(from, to)}</span>
          <Icon name="chevron-down" className="h-4 w-4 shrink-0 text-ink-muted" />
        </button>
        {from || to ? <button type="button" aria-label={`Clear ${label.toLowerCase()}`} onClick={() => onChange('', '')} className="inline-flex w-[52px] shrink-0 items-center justify-center rounded-field border-[1.5px] border-outline bg-white text-ink-soft hover:bg-brand-wash"><Icon name="close" className="h-5 w-5" /></button> : null}
      </div>
      {open ? (
        <div id={panelId} role="dialog" aria-label={label} className="absolute right-0 z-40 mt-2 w-[min(360px,calc(100vw-32px))] space-y-4 rounded-card border border-outline-soft bg-white p-4 shadow-sheet">
          <div>
            <p className="mb-2 text-[13px] font-semibold text-ink-soft">Quick choice</p>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => <ChoiceChip key={preset} selected={active === preset} onClick={() => { const range = presetRange(preset, today); apply(range.from, range.to); }}>{DATE_PRESET_LABELS[preset]}</ChoiceChip>)}
              <ChoiceChip selected={!from && !to} onClick={() => apply('', '')}>Any date</ChoiceChip>
            </div>
          </div>
          <fieldset className="grid grid-cols-2 gap-3">
            <legend className="mb-2 text-[13px] font-semibold text-ink-soft">Or choose dates</legend>
            <label className="text-[13px] font-semibold text-ink-soft">From<input type="date" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} className="mt-1.5 w-full rounded-field border-[1.5px] border-outline px-3 py-3 text-base text-ink" /></label>
            <label className="text-[13px] font-semibold text-ink-soft">To<input type="date" value={draftTo} min={draftFrom || undefined} onChange={(event) => setDraftTo(event.target.value)} className="mt-1.5 w-full rounded-field border-[1.5px] border-outline px-3 py-3 text-base text-ink" /></label>
          </fieldset>
          {!draftValid ? <p role="alert" className="text-[13px] font-medium text-danger">The end date must be on or after the start date.</p> : null}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => close()} className="min-h-[44px] rounded-field px-4 font-bold text-brand">Cancel</button>
            <button type="button" disabled={!draftValid} onClick={() => apply(draftFrom, draftTo)} className="min-h-[44px] rounded-field bg-brand px-4 font-bold text-white disabled:opacity-50">Apply dates</button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
