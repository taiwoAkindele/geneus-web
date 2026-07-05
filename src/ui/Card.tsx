import type { ReactNode } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
  /** Default 16px inset. Set false for list cards that manage their own rows. */
  padded?: boolean;
};

/**
 * Surface card — white on a hairline outline, 16px radius (design Foundations).
 * No shadow by default; the design leans on the border, not elevation.
 */
export const Card = ({ children, className = '', padded = true }: Props) => {
  return (
    <div
      className={`rounded-card border border-outline-soft bg-white ${padded ? 'p-4' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
