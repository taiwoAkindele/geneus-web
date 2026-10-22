import { useEffect, useRef } from 'react';

type Action = { label: string; onPress: () => void };

type Props = {
  onDigit: (digit: string) => void;
  /** Bottom-right key (e.g. Delete / Clear). Omit for a blank cell. */
  action?: Action;
  /** `light` = grey keys on a light surface; `dark` = translucent on green. */
  tone?: 'light' | 'dark';
};

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * On-screen numeric keypad for PIN entry. Layout matches the design: 1–9, then
 * a blank cell, 0, and the action key. Digits use the monospaced face.
 *
 * A physical keyboard works too while it is on screen: 0–9 (top row or numpad)
 * press that digit, Backspace/Delete press the action key.
 */
export const PinKeypad = ({ onDigit, action, tone = 'light' }: Props) => {
  // Latest handlers, so the listener below subscribes once and never calls a stale closure.
  const handlers = useRef({ onDigit, action });
  handlers.current = { onDigit, action };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (/^\d$/.test(event.key)) {
        event.preventDefault();
        handlers.current.onDigit(event.key);
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        handlers.current.action?.onPress();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const key =
    tone === 'dark' ? 'bg-white/10 text-white' : 'bg-surface-container text-ink';
  const actionColor = tone === 'dark' ? 'text-brand-on-dark' : 'text-ink-muted';

  return (
    <div className="grid grid-cols-3 gap-3">
      {DIGITS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onDigit(d)}
          className={`flex h-14 items-center justify-center rounded-2xl font-mono text-[22px] font-semibold ${key}`}
        >
          {d}
        </button>
      ))}
      <span />
      <button
        type="button"
        onClick={() => onDigit('0')}
        className={`flex h-14 items-center justify-center rounded-2xl font-mono text-[22px] font-semibold ${key}`}
      >
        0
      </button>
      {action ? (
        <button
          type="button"
          onClick={action.onPress}
          className={`flex h-14 min-h-0 items-center justify-center rounded-2xl text-[13px] font-semibold ${actionColor}`}
        >
          {action.label}
        </button>
      ) : (
        <span />
      )}
    </div>
  );
};
