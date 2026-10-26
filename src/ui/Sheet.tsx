import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { Button } from './Button';

const CloseContext = createContext<(() => void) | undefined>(undefined);
export const SheetCancelButton = ({ children = 'Cancel', disabled = false }: { children?: ReactNode; disabled?: boolean }) => {
  const close = useContext(CloseContext);
  return <Button variant="outlined" disabled={disabled} onClick={close}>{children}</Button>;
};

type Props = {
  onClose: () => void;
  title?: string;
  eyebrow?: string;
  children: ReactNode;
  closeDisabled?: boolean;
  placement?: 'center' | 'side';
  hasUnsavedChanges?: boolean;
};

/** Native modal supplies focus containment and makes the page behind it inert. */
export const Sheet = ({ onClose, title, eyebrow, children, closeDisabled = false, placement = 'center', hasUnsavedChanges = false }: Props) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const discardPrompt = useRef<HTMLDivElement>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  useLayoutEffect(() => {
    if (!confirmDiscard) return;
    discardPrompt.current?.scrollIntoView({ block: 'start' });
    discardPrompt.current?.querySelector('button')?.focus();
  }, [confirmDiscard]);
  const close = () => { if (closeDisabled) return; if (hasUnsavedChanges) setConfirmDiscard(true); else onClose(); };
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsavedChanges]);

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
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); close(); }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        // A nested review owns its focus trap and Escape dismissal; its parent
        // must not consume either event or discard the whole underlying form.
        event.stopPropagation();
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
      className={`fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none flex-col justify-end border-0 bg-transparent p-0 text-ink backdrop:bg-black/40 open:flex ${placement === 'side' ? 'sm:items-end sm:justify-start' : 'sm:items-center sm:justify-center sm:p-6'}`}>
      <div className={`relative w-full overflow-auto bg-white px-5 pb-6 pt-5 shadow-sheet ${placement === 'side' ? 'h-[100dvh] max-h-[100dvh] sm:max-w-lg sm:border-l sm:border-outline-soft' : 'max-h-[90dvh] rounded-t-sheet sm:max-w-lg sm:rounded-sheet'}`}>
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
        {confirmDiscard ? <div ref={discardPrompt} role="alert" className="mb-5 rounded-field border border-amber-border bg-amber-bg p-4 text-sm">
          <p className="font-bold">Discard unsaved changes?</p><p className="mt-1">Your saved record will stay unchanged.</p>
          <div className="mt-3 flex flex-wrap gap-3"><button type="button" className="rounded-field bg-brand px-4 py-2 font-bold text-white" onClick={() => setConfirmDiscard(false)}>Keep editing</button><button type="button" className="rounded-field border border-danger px-4 py-2 font-bold text-danger" onClick={onClose}>Discard changes</button></div>
        </div> : null}
        <CloseContext.Provider value={close}>{children}</CloseContext.Provider>
      </div>
    </dialog>
  );
};
