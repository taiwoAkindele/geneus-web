import { useEffect, useRef } from 'react';

type Option<T extends string> = { value: T; label: string; count?: number };
type Props<T extends string> = { label: string; value: T; options: readonly Option<T>[]; onChange: (value: T) => void; className?: string };

/** One navigation treatment for route/query-backed sections throughout the app. */
export const SectionTabs = <T extends string,>({ label, value, options, onChange, className = '' }: Props<T>) => {
  const navigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const parent = navigation.current, selected = parent?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!parent || !selected) return;
    const bounds = parent.getBoundingClientRect(), item = selected.getBoundingClientRect();
    if (item.left < bounds.left) parent.scrollLeft -= bounds.left - item.left;
    else if (item.right > bounds.right) parent.scrollLeft += item.right - bounds.right;
  }, [value]);
  return <nav ref={navigation} aria-label={label} className={`flex min-w-0 gap-4 overflow-x-auto border-b border-outline-soft ${className}`} onKeyDown={(event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    const index = buttons.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
    buttons[next]?.focus(); onChange(options[next].value);
  }}>{options.map((option) => <button key={option.value} type="button" aria-current={value === option.value ? 'page' : undefined} onClick={() => onChange(option.value)} className={`min-h-[52px] shrink-0 border-b-2 px-2 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-brand ${value === option.value ? 'border-brand text-brand' : 'border-transparent text-ink-soft hover:text-brand'}`}>
    {option.label}{option.count !== undefined ? <span className="ml-1.5 text-xs tabular-nums"> ({option.count})</span> : null}
  </button>)}</nav>;
};
