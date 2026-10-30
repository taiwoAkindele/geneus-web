// Synthetic browser acceptance data. Never imported by the production app.
import { Facility } from '@shared';
const envelope = { schemaVersion: 4, createdBy: 'system', createdOn: '2026-10-30T09:00:00Z' };
export const primary = Facility.parse({ ...envelope, id: 'SUN-LAG', code: 'SUN-LAG', facilityId: 'SUN-LAG', deviceId: 'qa-device-A', type: 'facility', name: 'Sunrise Hospital, Lagos', state: 'Lagos', lga: 'Ikeja', level: 'general_hospital' });
export const second = Facility.parse({ ...primary, id: 'SUN-IBD', code: 'SUN-IBD', facilityId: 'SUN-IBD', deviceId: 'qa-device-B', name: 'Sunrise Hospital, Ibadan', state: 'Oyo', lga: 'Ibadan North' });
export const created = () => { const raw = sessionStorage.getItem('qa-created-facility'); return raw ? Facility.parse(JSON.parse(raw)) : undefined; };
export const selected = () => {
  const id = new URLSearchParams(location.search).get('facility') ?? primary.id;
  return [primary, second, created()].find((facility) => facility?.id === id) ?? primary;
};
export const staffIdFor = (id: string) => id === primary.id ? 'qa-admin-A' : id === second.id ? 'qa-nurse-B' : 'qa-admin-new';
