import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

type Action = { label: string; onSelect: () => void; icon?: IconName };

/** A portalled menu stays visible inside a horizontally scrollable table. */
export const ActionMenu = ({ label, title, actions, compact = false }: { label: string; title?: string; actions: Action[]; compact?: boolean }) => {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open || !trigger.current || !menu.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const height = menu.current.getBoundingClientRect().height;
    setPosition({ left: Math.max(8, Math.min(rect.right - 272, innerWidth - 280)), top: rect.bottom + height + 8 < innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - height - 4) });
    menu.current.querySelector<HTMLButtonElement>('button')?.focus();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    const scroll = () => setOpen(false);
    document.addEventListener('pointerdown', dismiss);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', scroll);
    return () => { document.removeEventListener('pointerdown', dismiss); window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', scroll); };
  }, [open]);
  return <>
    <button ref={trigger} type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen(!open)} className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-field font-bold text-brand hover:bg-brand-wash focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${compact ? 'w-11' : 'border border-outline px-4'}`}>
      {compact ? <Icon name="more" /> : <>{label}<Icon name="chevron-down" className="h-4 w-4" /></>}
    </button>
    {open ? createPortal(<div ref={menu} id={id} role="menu" aria-label={title ?? label} style={position} className="fixed z-50 w-[272px] max-w-[calc(100vw-16px)] rounded-field border border-outline-soft bg-white p-2 shadow-sheet" onKeyDown={(event) => {
      const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.key === 'Escape' || event.key === 'Tab') { if (event.key === 'Escape') event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    }}>
      {title ? <p className="border-b border-outline-soft px-3 py-2 text-xs font-bold text-ink-soft">{title}</p> : null}
      {actions.map((action) => <button key={action.label} role="menuitem" type="button" className="flex min-h-[48px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-brand-wash focus:bg-brand-wash focus:outline-none" onClick={() => { setOpen(false); trigger.current?.focus(); action.onSelect(); }}>{action.icon ? <Icon name={action.icon} className="h-4 w-4" /> : null}{action.label}</button>)}
    </div>, document.body) : null}
  </>;
};
