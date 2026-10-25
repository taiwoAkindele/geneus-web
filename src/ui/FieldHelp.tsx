import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export type FieldExplanation = { purpose: string; example?: string };

type HelpProps = { label: string; help: FieldExplanation };
/** Hover/focus help on desktop; an explicit toggle also works on touch devices. */
const HelpButton = ({ label, help }: HelpProps) => {
  const tooltipId = useId();
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number }>();
  const open = pinned || hovered || focused;
  const close = () => { setPinned(false); setHovered(false); setFocused(false); };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = button.current?.getBoundingClientRect();
      if (!anchor) return;
      const width = Math.min(288, window.innerWidth - 32);
      const height = tooltip.current?.offsetHeight ?? 140;
      const left = Math.max(16, Math.min(anchor.left, window.innerWidth - width - 16));
      const below = anchor.bottom + 8;
      const top = below + height < window.innerHeight - 16 ? below : Math.max(16, anchor.top - height - 8);
      setPosition({ left, top, width });
    };
    place();
    window.addEventListener('resize', place);
    document.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); document.removeEventListener('scroll', place, true); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [open]);

  return <span ref={root} className="inline-flex shrink-0">
    <button ref={button} type="button" aria-label={`Help for ${label}`} aria-expanded={open}
      aria-describedby={open ? tooltipId : undefined}
      onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true); }}
      onPointerLeave={() => setHovered(false)}
      onFocus={(event) => setFocused(event.currentTarget.matches(':focus-visible'))}
      onBlur={close} onClick={() => setPinned((value) => !value)}
      className="inline-flex h-8 w-8 min-h-0 items-center justify-center rounded-full text-ink-muted hover:bg-brand-tint hover:text-brand focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
      <span aria-hidden="true" className="flex h-4 w-4 items-center justify-center rounded-full border border-current text-[11px] font-bold">?</span>
    </button>
    {open ? <span ref={tooltip} id={tooltipId} role="tooltip"
      style={{ ...position, visibility: position ? 'visible' : 'hidden' }}
      className="pointer-events-none fixed z-50 block w-72 max-w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-auto rounded-xl border border-outline-soft bg-white p-3 text-left text-[13px] font-normal leading-relaxed text-ink shadow-sheet">
      <span className="block font-bold">{label}</span>
      <span className="mt-1 block">{help.purpose}</span>
      {help.example ? <span className="mt-2 block text-ink-soft"><b>Example:</b> {help.example}</span> : null}
    </span> : null}
  </span>;
};

type LabelProps = { label: string; htmlFor?: string; id?: string; help?: FieldExplanation; descriptionId?: string; required?: boolean };
export const FieldLabel = ({ label, htmlFor, id, help, descriptionId, required }: LabelProps) => <div className="mb-1.5 flex min-h-5 items-center gap-1 text-[13px] font-semibold text-ink-soft">
  {htmlFor ? <label id={id} htmlFor={htmlFor}>{label}{required ? <span className="text-danger" aria-hidden="true"> *</span> : null}</label>
    : <span id={id}>{label}{required ? <span className="text-danger" aria-hidden="true"> *</span> : null}</span>}
  {help ? <>
    <HelpButton label={label} help={help} />
    {descriptionId ? <span id={descriptionId} className="sr-only">{help.purpose}{help.example ? ` Example: ${help.example}` : ''}</span> : null}
  </> : null}
</div>;
