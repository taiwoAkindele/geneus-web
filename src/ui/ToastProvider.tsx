import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/**
 * Lightweight toast system. Toasts confirm a *user action / mutation* — a write
 * that succeeded ("Sent to Injection Room"), so staff get honest feedback that
 * their offline-first write landed. Never used for reads (docs/ENGINEERING.md). No
 * dependency: a small context + auto-dismissing stack.
 */
type ToastTone = 'success' | 'info' | 'error';

type Toast = { id: number; message: string; tone: ToastTone };

type ToastOptions = { tone?: ToastTone; durationMs?: number };

type ToastFn = (message: string, opts?: ToastOptions) => void;

const ToastContext = createContext<ToastFn | null>(null);

const TONE: Record<ToastTone, { box: string; icon: IconName }> = {
  success: { box: 'bg-brand text-white', icon: 'check' },
  info: { box: 'bg-slate text-white', icon: 'sync' },
  error: { box: 'bg-danger text-white', icon: 'warning' },
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const layer = useRef<HTMLDivElement>(null);

  const show = useCallback<ToastFn>((message, opts) => {
    const id = nextId.current++;
    const tone = opts?.tone ?? 'success';
    setToasts((list) => [...list, { id, message, tone }]);
    // Errors stay longer: they usually need reading before acting.
    const duration = opts?.durationMs ?? (tone === 'error' ? 7000 : 3500);
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, duration);
  }, []);

  // An open sheet is a native modal in the browser's top layer, which would cover an ordinary
  // fixed element. Shown as a manual popover, the toasts join the top layer and are re-raised
  // above whatever sheet is open each time a toast appears. Browsers without popovers keep the fixed layer.
  useEffect(() => {
    const el = layer.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!el?.showPopover || !el.hidePopover) return;
    if (!el.hasAttribute('popover')) el.setAttribute('popover', 'manual');
    try {
      if (el.matches(':popover-open')) el.hidePopover();
      if (toasts.length) el.showPopover();
    } catch { /* The fixed layer still shows the toast. */ }
  }, [toasts]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* Top right, just below the app header; non-interactive so it never blocks taps. On a phone it spans the width. */}
      <div
        ref={layer}
        className="pointer-events-none fixed z-50 flex flex-col items-end gap-2"
        style={{ inset: 'calc(env(safe-area-inset-top, 0px) + 4.75rem) 1rem auto 1rem', width: 'auto', height: 'auto', margin: 0, padding: 0, border: 0, background: 'transparent', overflow: 'visible', color: 'inherit' }}
        role="status"
        aria-live={toasts.some((t) => t.tone === 'error') ? 'assertive' : 'polite'}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex w-full max-w-sm items-center gap-2.5 rounded-field px-4 py-3 text-[15px] font-bold shadow-sheet ${TONE[t.tone].box}`}
          >
            <Icon name={TONE[t.tone].icon} className="h-5 w-5" />
            <span className="flex-1">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastFn => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
};
