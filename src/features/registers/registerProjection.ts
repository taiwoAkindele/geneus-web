import type { RegisterDefinition, RegisterEntry, Staff } from '@shared';
import type { RegisterDef, RegisterRow } from './types';

export const projectRegisters = (definitions: readonly RegisterDefinition[], entries: readonly RegisterEntry[], staff: readonly Staff[]): RegisterDef[] => {
  const current = new Map<string, RegisterDefinition>();
  const versions = new Map(definitions.map((definition) => [definition.registerId + '|' + definition.version, definition]));
  const names = new Map(staff.map((member) => [member.staffId, member.fullName]));
  for (const definition of definitions) {
    const existing = current.get(definition.registerId);
    if (!existing || definition.version > existing.version) current.set(definition.registerId, definition);
  }
  return [...current.values()].map((definition) => ({
    id: definition.registerId, name: definition.name, category: definition.category, description: definition.description,
    status: definition.status, version: definition.version, fields: definition.fields,
    rows: entries.filter((entry) => entry.registerId === definition.registerId).sort((a, b) => b.createdOn.localeCompare(a.createdOn)).map((entry): RegisterRow => ({
      id: entry.id, by: names.get(entry.createdBy) ?? entry.createdBy, when: new Date(entry.createdOn).toLocaleString('en-GB'),
      entryDate: entry.entryDate, registerVersion: entry.registerVersion, values: entry.values,
      fields: versions.get(entry.registerId + '|' + entry.registerVersion)?.fields ?? Object.keys(entry.values).map((id) => ({ id, label: id, type: 'text' as const, required: false })),
    })),
  }));
};
