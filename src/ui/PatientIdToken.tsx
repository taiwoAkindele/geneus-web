type Part = { label: string; value: string };

type Props = {
  id: string;
  /** Optional segment breakdown (facility / patient # / safety code). */
  parts?: Part[];
  /** `card` (default) is the dashed box; `inline` is the small list chip. */
  variant?: 'card' | 'inline';
  className?: string;
};

/**
 * Patient ID rendered in the monospaced face so every digit is the same width
 * and impossible to misread when read aloud ("patient 47"). The card variant
 * shows the dashed token with an optional segment breakdown; the inline variant
 * is the compact chip used in search results and headers.
 */
export const PatientIdToken = ({ id, parts, variant = 'card', className = '' }: Props) => {
  if (variant === 'inline') {
    return (
      <span
        className={`inline-block rounded-md bg-surface-muted px-2 py-1 font-mono text-xs text-brand ${className}`}
      >
        {id}
      </span>
    );
  }
  return (
    <div
      className={`rounded-field border border-dashed border-outline bg-surface-muted px-4 py-4 ${className}`}
    >
      <div className="font-mono text-xl font-semibold tracking-tight text-brand">{id}</div>
      {parts?.length ? (
        <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-ink-muted">
          {parts.map((p) => (
            <span key={p.label}>
              <b className="text-ink-soft">{p.value}</b> {p.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
