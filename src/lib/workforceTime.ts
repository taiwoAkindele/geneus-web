/** Wall-clock inputs use the service zone, not the phone's current zone. */
export const zonedInput = (instant: string, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
  const get = (name: string) => parts.find((p) => p.type === name)?.value;
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
};
export const zonedInstant = (input: string, timeZone: string, occurrence: 'reject' | 'earlier' | 'later' = 'reject'): string => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input))
    throw new Error('Choose a complete date and time');
  const wall = Date.parse(`${input}:00Z`), candidates = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = wall + hours * 3600000, local = Date.parse(`${zonedInput(new Date(sample).toISOString(), timeZone)}:00Z`), target = wall - (local - sample);
    if (zonedInput(new Date(target).toISOString(), timeZone) === input)
      candidates.add(target);
  }
  const sorted = [...candidates].sort((a, b) => a - b);
  if (!sorted.length)
    throw new Error('This time does not exist in the selected timezone. Choose another time');
  if (sorted.length > 1 && occurrence === 'reject')
    throw new Error('This clock time occurs twice. Choose its earlier or later occurrence');
  return new Date(occurrence === 'later' ? sorted[sorted.length - 1] : sorted[0]).toISOString();
};
export const showInterval = (start: string, end: string | undefined, zone = 'Africa/Lagos'): string => {
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: zone, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  return `${formatter.format(new Date(start))}${end ? ` – ${formatter.format(new Date(end))}` : ' onwards'} · ${zone}`;
};
