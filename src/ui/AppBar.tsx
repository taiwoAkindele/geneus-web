import type { ReactNode } from 'react';

type Props = {
  title: string;
  /** Show a back chevron and call this on tap. */
  onBack?: () => void;
  /** Optional trailing slot (e.g. a StatusPill or an action). */
  right?: ReactNode;
  /**
   * `surface` (default) — dark title on the app background, for most screens.
   * `brand` — white title on primary green, for the patient-context header.
   */
  variant?: 'surface' | 'brand';
};

/**
 * Screen app bar. The design uses two treatments: a plain surface bar with an
 * optional back chevron, and a green context bar on clinical screens.
 */
export function AppBar({ title, onBack, right, variant = 'surface' }: Props) {
  const brand = variant === 'brand';
  return (
    <header
      className={`sticky top-0 z-10 flex items-center gap-2 px-5 py-3 ${
        brand ? 'bg-brand text-white' : 'bg-surface text-ink'
      }`}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="-ml-2 flex h-11 w-11 min-h-0 flex-none items-center justify-center text-2xl leading-none text-current"
        >
          ‹
        </button>
      ) : null}
      <span className="flex-1 truncate text-xl font-extrabold tracking-[-0.02em]">{title}</span>
      {right ? <div className="flex-none">{right}</div> : null}
    </header>
  );
}
