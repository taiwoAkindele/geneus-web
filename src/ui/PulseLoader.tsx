type Props = {
  /** What is happening, in plain words — also what a screen reader announces. */
  label: string;
  className?: string;
};

/**
 * The one full-screen "still working" signal: a brand-green dot with a ring
 * pulsing out of it, and a short line saying what is being waited on. Only for
 * work that is genuinely in progress — a failure gets words and a way out, not
 * an endless pulse. Reduced-motion users see a still dot.
 */
export const PulseLoader = ({ label, className = '' }: Props) => {
  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center ${className}`}>
      <span aria-hidden className="relative flex h-6 w-6">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-strong opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-6 w-6 animate-pulse rounded-full bg-brand motion-reduce:animate-none" />
      </span>
      <p className="mt-5 text-sm text-ink-muted">{label}</p>
    </div>
  );
};
