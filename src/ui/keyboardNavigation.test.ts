import { describe, expect, it } from 'vitest';
import { nextFocusIndex } from './keyboardNavigation';

describe('nextFocusIndex', () => {
  it('jumps to the first and last items for Home and End', () => {
    expect(nextFocusIndex('Home', 2, 5, 'ArrowDown')).toBe(0);
    expect(nextFocusIndex('End', 2, 5, 'ArrowDown')).toBe(4);
  });

  it('moves forward with the forward arrow and back with any other arrow', () => {
    expect(nextFocusIndex('ArrowDown', 2, 5, 'ArrowDown')).toBe(3);
    expect(nextFocusIndex('ArrowUp', 2, 5, 'ArrowDown')).toBe(1);
    expect(nextFocusIndex('ArrowRight', 0, 3, 'ArrowRight')).toBe(1);
  });

  it('wraps past either end', () => {
    expect(nextFocusIndex('ArrowDown', 4, 5, 'ArrowDown')).toBe(0);
    expect(nextFocusIndex('ArrowUp', 0, 5, 'ArrowDown')).toBe(4);
  });
});
