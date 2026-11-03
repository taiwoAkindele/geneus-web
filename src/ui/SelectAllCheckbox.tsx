import { useEffect, useRef } from 'react';

/**
 * "Select all" for a checklist: ticked when every key is picked, partly ticked when
 * some are, disabled when there is nothing to pick. It acts only on `keys` (what is
 * shown and selectable) and keeps any other picks.
 */
export const SelectAllCheckbox = ({ keys, picked, onChange, label = 'Select all' }: { keys: readonly string[]; picked: ReadonlySet<string>; onChange: (picked: Set<string>) => void; label?: string }) => {
  const box = useRef<HTMLInputElement>(null);
  const chosen = keys.filter((key) => picked.has(key)).length;
  const all = keys.length > 0 && chosen === keys.length, some = chosen > 0 && !all;
  useEffect(() => { if (box.current) box.current.indeterminate = some; }, [some]);
  const toggle = () => {
    const next = new Set(picked);
    for (const key of keys) { if (all) next.delete(key); else next.add(key); }
    onChange(next);
  };
  return <label className={`flex min-h-[44px] items-center gap-3 rounded-field px-2 py-2 text-sm font-bold ${keys.length ? 'hover:bg-surface' : 'text-ink-muted'}`}>
    <input ref={box} type="checkbox" className="h-5 w-5 min-h-0 accent-brand" checked={all} disabled={!keys.length} onChange={toggle} />{label}
  </label>;
};
