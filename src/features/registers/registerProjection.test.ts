import { expect, it } from 'vitest';
import { RegisterDefinition, RegisterEntry, Staff } from '@shared';
import { projectRegisters } from './registerProjection';
const base = { facilityId: 'TEST', createdBy: 'staff:one', createdOn: '2026-10-26T10:00:00Z', deviceId: 'device:one' };
it('renders historic entries against their own saved schema and readable author', () => {
  const original = RegisterDefinition.parse({ ...base, type: 'register_definition', id: 'register:one:v1', registerId: 'register:one', version: 1, name: 'Daily', category: 'General', status: 'published', fields: [{ id: 'old', type: 'text', label: 'Original question' }] });
  const newer = RegisterDefinition.parse({ ...original, id: 'register:one:v2', version: 2, fields: [{ id: 'new', type: 'number', label: 'New question' }] });
  const entry = RegisterEntry.parse({ ...base, type: 'register_entry', id: 'entry:one', registerId: original.registerId, registerVersion: 1, entryDate: '2026-10-26', values: { old: 'Original answer' } });
  const staff = Staff.parse({ ...base, type: 'staff', id: 'staff:one', staffId: 'staff:one', fullName: 'Records Officer', role: 'records_officer' });
  const [register] = projectRegisters([original, newer], [entry], [staff]);
  expect(register.version).toBe(2);
  expect(register.rows[0]).toMatchObject({ registerVersion: 1, by: 'Records Officer', fields: [{ id: 'old', label: 'Original question' }], values: { old: 'Original answer' } });
});
it('keeps a published register available while its newer draft is being prepared', () => {
  const published = RegisterDefinition.parse({ ...base, type: 'register_definition', id: 'daily:v1', registerId: 'daily', version: 1, name: 'Daily', category: 'General', status: 'published', fields: [{ id: 'original', type: 'text', label: 'Original question' }] });
  const draft = RegisterDefinition.parse({ ...published, id: 'daily:v2', version: 2, name: 'Work in progress', status: 'draft', fields: [] });
  const [register] = projectRegisters([published, draft], [], []);
  expect(register).toMatchObject({ status: 'published', version: 1, name: 'Daily', hasDraft: true });
  expect(register.fields[0].label).toBe('Original question');
  expect(register.configuration).toMatchObject({ version: 2, name: 'Work in progress', fields: [] });
});
