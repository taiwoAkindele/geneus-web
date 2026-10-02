import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
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

  const show = useCallback<ToastFn>((message, opts) => {
    const id = nextId.current++;
    const tone = opts?.tone ?? 'success';
    setToasts((list) => [...list, { id, message, tone }]);
    const duration = opts?.durationMs ?? 3000;
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, duration);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* Sits above the bottom nav; non-interactive so it never blocks taps. */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-5"
        role="status"
        aria-live="polite"
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
