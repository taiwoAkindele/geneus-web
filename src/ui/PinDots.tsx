type Props = {
  /** Total digits in the PIN (default 4). */
  length?: number;
  /** How many are entered so far. */
  filled: number;
  className?: string;
};

/** Row of PIN progress dots — filled = primary green, empty = outline ring. */
export const PinDots = ({ length = 4, filled, className = '' }: Props) => {
  return (
    <div className={`flex justify-center gap-3 ${className}`}>
      {Array.from({ length }).map((_, i) => (
        <span
          key={i}
          className={`h-3.5 w-3.5 rounded-full ${
            i < filled ? 'bg-brand' : 'border-2 border-outline'
          }`}
        />
      ))}
    </div>
  );
};
