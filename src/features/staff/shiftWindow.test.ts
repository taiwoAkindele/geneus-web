import { describe, expect, it } from 'vitest';
import type { RosterShift } from '@shared';
import { findShift } from '@/data/repos/staff';
import { fullDayEnd, shiftWindow } from './shiftWindow';
import { shiftRangeLabel } from '@/session/shiftLabels';

const record = (id: string, day: string, start: string, end: string, next: boolean): RosterShift => ({
  ...shiftWindow(day, start, end, next), id, type: 'roster_shift', facilityId: 'TEST-PHC', schemaVersion: 3,
  createdBy: 'admin', createdOn: '2026-10-24T06:00:00Z', deviceId: 'device:test', staffId: 'staff:nurse',
});

describe('overnight and full-day shifts', () => {
  it('represents a complete 24-hour window across midnight', () => {
    const end = fullDayEnd('2026-10-24', '08:00');
    expect(end).toEqual({ end: '08:00', endsNextDay: true });
    const window = shiftWindow('2026-10-24', '08:00', end.end, end.endsNextDay);
    expect(Date.parse(window.endsAt) - Date.parse(window.startsAt)).toBe(24 * 60 * 60_000);
  });
  it('supports overnight shifts and rejects an inverted same-day window', () => {
    expect(() => shiftWindow('2026-10-24', '20:00', '08:00', false)).toThrow(/next day/);
    expect(Date.parse(shiftWindow('2026-10-24', '20:00', '08:00', true).endsAt)
      - Date.parse(shiftWindow('2026-10-24', '20:00', '08:00', true).startsAt)).toBe(12 * 60 * 60_000);
    expect(() => shiftWindow('2026-10-24', '08:00', '08:00', false)).toThrow();
    expect(() => shiftWindow('2026-02-31', '08:00', '16:00', false)).toThrow();
  });
  it('keeps yesterday’s active shift after midnight, ahead of a later scheduled shift', () => {
    const overnight = record('overnight', '2026-10-24', '20:00', '08:00', true);
    const later = record('later', '2026-10-25', '09:00', '17:00', false);
    expect(findShift([later, overnight], 'staff:nurse', new Date('2026-10-25T01:00:00').getTime())?.id).toBe('overnight');
    expect(findShift([later, overnight], 'staff:nurse', new Date('2026-10-25T09:00:00').getTime())?.id).toBe('later');
    expect(shiftRangeLabel(overnight)).toContain('25 Oct');
  });
  it('finds a full-day window on the second day without relying on the roster ID date', () => {
    const full = record('legacy-id', '2026-10-24', '08:00', '08:00', true);
    expect(findShift([full], 'staff:nurse', new Date('2026-10-25T07:59:00').getTime())?.id).toBe('legacy-id');
    expect(findShift([full], 'staff:nurse', new Date('2026-10-25T08:00:00').getTime())).toBeUndefined();
  });
});
