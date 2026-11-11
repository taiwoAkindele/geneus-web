import { calendarDate } from '@/lib/calendarDate';

const localTime = (day: string, time: string): Date => {
  const result = new Date(`${day}T${time}:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)
      || !Number.isFinite(result.getTime()) || calendarDate(result) !== day) {
    throw new Error('Choose a valid date and time for the shift');
  }
  return result;
};

export const shiftWindow = (day: string, start: string, end: string, endsNextDay: boolean) => {
  const startsAt = localTime(day, start), endsAt = localTime(day, end);
  if (endsNextDay) endsAt.setDate(endsAt.getDate() + 1);
  if (endsAt.getTime() <= startsAt.getTime()) throw new Error('The shift must end after it starts. Choose next day for an overnight shift.');
  return { day, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
};

export const fullDayEnd = (day: string, start: string) => {
  const startsAt = localTime(day, start), endsAt = new Date(startsAt.getTime() + 24 * 60 * 60_000);
  return {
    end: `${String(endsAt.getHours()).padStart(2, '0')}:${String(endsAt.getMinutes()).padStart(2, '0')}`,
    endsNextDay: calendarDate(endsAt) !== day,
  };
};
