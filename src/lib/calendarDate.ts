/** Calendar dates follow the device's configured local timezone, including midnight. */
export const calendarDate = (value: string | Date = new Date()): string => {
  const date = typeof value === 'string' ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
