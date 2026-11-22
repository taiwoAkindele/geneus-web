/**
 * Where focus moves in a list for Home, End and the arrow keys. `forwardKey` is the arrow
 * that moves to the next item; any other arrow moves back. Moving past either end wraps.
 */
export const nextFocusIndex = (
  key: string,
  current: number,
  count: number,
  forwardKey: string,
): number => {
  if (key === 'Home') {
    return 0;
  }

  if (key === 'End') {
    return count - 1;
  }

  const step = key === forwardKey ? 1 : -1;

  return (current + step + count) % count;
};
