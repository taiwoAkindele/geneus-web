import { useEffect, useState } from 'react';

/** Derive the countdown from the actual end instant so sleeping tabs catch up. */
export const useShiftCountdown = (minutesLeft: number, endsOn?: string): number => {
  const [seconds, setSeconds] = useState(() => endsOn ? Math.max(0, Math.ceil((Date.parse(endsOn) - Date.now()) / 1000)) : minutesLeft * 60);
  useEffect(() => {
    const target = endsOn ? Date.parse(endsOn) : Date.now() + minutesLeft * 60_000;
    const tick = () => setSeconds(Math.max(0, Math.ceil((target - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  }, [minutesLeft, endsOn]);
  return seconds;
};

export const formatCountdown = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
