import { useEffect, useState } from 'react';

/**
 * Live shift countdown in seconds, derived from the session's `minutesLeft`.
 * Ticks down once a second so the UI shows a real countdown; resets whenever the
 * shift is extended (minutesLeft changes). Mock timing for now — the real value
 * comes from the offline roster (PLAN FE-M1).
 */
export const useShiftCountdown = (minutesLeft: number): number => {
  const [seconds, setSeconds] = useState(minutesLeft * 60);

  useEffect(() => {
    setSeconds(minutesLeft * 60);
    const id = window.setInterval(() => {
      setSeconds((s) => (s <= 0 ? 0 : s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [minutesLeft]);

  return seconds;
};

/** Format a seconds value as `m:ss` (e.g. 1805 → "30:05"). */
export const formatCountdown = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
