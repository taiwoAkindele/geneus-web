import { describe, expect, it } from 'vitest';
import { formatRange, inRange, matchingPreset, presetRange, validRange } from './dateRange';

describe('date ranges for filters', () => {
  const today = '2026-11-10';

  it('turns quick choices into inclusive ranges, across month and year ends', () => {
    expect(presetRange('today', today)).toEqual({ from: today, to: today });
    expect(presetRange('last7', today)).toEqual({ from: '2026-11-04', to: today });
    expect(presetRange('next7', today)).toEqual({ from: today, to: '2026-11-16' });
    expect(presetRange('next30', '2026-12-20')).toEqual({ from: '2026-12-20', to: '2027-01-18' });
    expect(presetRange('thisMonth', '2027-02-14')).toEqual({ from: '2027-02-01', to: '2027-02-28' });
    expect(presetRange('last7', '2026-03-03')).toEqual({ from: '2026-02-25', to: '2026-03-03' });
  });

  it('recognises which quick choice a range came from', () => {
    expect(matchingPreset('2026-11-10', '2026-11-16', today, ['last7', 'next7'])).toBe('next7');
    expect(matchingPreset('2026-11-10', '2026-11-17', today, ['last7', 'next7'])).toBeUndefined();
  });

  it('describes a range in plain words', () => {
    expect(formatRange('', '')).toBe('Any date');
    expect(formatRange('2026-11-10', '2026-11-10')).toBe('10 Nov 2026');
    expect(formatRange('2026-11-10', '2026-11-16')).toBe('10 Nov – 16 Nov 2026');
    expect(formatRange('2026-12-28', '2027-01-03')).toBe('28 Dec 2026 – 3 Jan 2027');
    expect(formatRange('2026-11-10', '')).toBe('From 10 Nov 2026');
    expect(formatRange('', '2026-11-16')).toBe('Until 16 Nov 2026');
  });

  it('refuses an end before the start, and treats blank ends as open', () => {
    expect(validRange('2026-11-16', '2026-11-10')).toBe(false);
    expect(validRange('2026-11-10', '')).toBe(true);
    expect(inRange('2026-11-12', '2026-11-10', '2026-11-16')).toBe(true);
    expect(inRange('2026-11-17', '2026-11-10', '2026-11-16')).toBe(false);
    expect(inRange('2020-01-01', '', '2026-11-16')).toBe(true);
    expect(inRange('2030-01-01', '2026-11-10', '')).toBe(true);
  });
});
