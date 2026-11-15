const supportedZones: string[] = (Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone')
  ?? ['Africa/Lagos', 'Africa/Accra', 'Africa/Nairobi', 'Africa/Johannesburg', 'Europe/London'];

export const timeZoneOptions = (current?: string) => [...new Set([...(current ? [current] : []), 'Africa/Lagos', 'UTC', ...supportedZones])]
  .map((zone) => ({ value: zone, label: zone }));
