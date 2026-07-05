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
 */
export const PinKeypad = ({ onDigit, action, tone = 'light' }: Props) => {
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
