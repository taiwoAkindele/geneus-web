import type { RosterShift } from '@shared';
import { calendarDate } from '@/lib/calendarDate';

const timeLabel = (value: string): string =>
  new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Overnight and 24-hour shifts must visibly identify the following day. */
export const shiftEndLabel = (shift: RosterShift): string => {
  const end = shift.extendedUntil ?? shift.endsAt;
  return calendarDate(shift.startsAt) === calendarDate(end) ? timeLabel(end)
    : new Date(end).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
export const shiftRangeLabel = (shift: RosterShift): string =>
  `${timeLabel(shift.startsAt)}–${shiftEndLabel(shift)}`;
