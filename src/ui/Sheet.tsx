import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

type Props = {
  onClose: () => void;
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  closeDisabled?: boolean;
};

/** Native modal supplies focus containment and makes the page behind it inert. */
export const Sheet = ({ onClose, title, eyebrow, children, closeDisabled = false }: Props) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const close = () => { if (!closeDisabled) onClose(); };

  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    (heading.current ?? element).focus({ preventScroll: true });
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={dialog} tabIndex={-1} aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : eyebrow ?? 'Details'} aria-modal="true"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [tabindex]')]
          .filter((item) => item.tabIndex >= 0 && !item.matches(':disabled') && item.getClientRects().length > 0);
        const first = items[0], last = items[items.length - 1];
        if (!first) { event.preventDefault(); event.currentTarget.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement as HTMLElement))) {
          event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
      className="fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none flex-col justify-end border-0 bg-transparent p-0 text-ink backdrop:bg-black/40 open:flex sm:items-center sm:justify-center sm:p-6">
      <div className="relative max-h-[90dvh] w-full overflow-auto rounded-t-sheet bg-white px-5 pb-6 pt-5 shadow-sheet sm:max-w-lg sm:rounded-sheet">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-outline-hair sm:hidden" />
        {(title || eyebrow) ? (
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              {eyebrow ? <div className="text-xs font-bold uppercase tracking-[0.06em] text-brand-strong">{eyebrow}</div> : null}
              {title ? <h2 ref={heading} id={titleId} tabIndex={-1} className="mt-0.5 text-[19px] font-extrabold tracking-[-0.02em] text-ink outline-none">{title}</h2> : null}
            </div>
            <button type="button" onClick={close} disabled={closeDisabled} aria-label="Close"
              className="flex h-11 w-11 min-h-0 flex-none items-center justify-center rounded-full text-ink-soft disabled:opacity-50">
              <Icon name="close" className="h-5 w-5" />
            </button>
          </div>
        ) : null}
        {children}
      </div>
    </dialog>
  );
};
