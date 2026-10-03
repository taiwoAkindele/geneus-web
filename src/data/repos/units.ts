import type { AuthorizationContext, Unit } from '@shared';
import { allOfType, envelope, insertRecord, newId, updateRecord } from '../db';

/** The rooms a facility actually has (PRD §9.7) — set up by the facility, never a fixed list. */
export const listUnits = () => allOfType<Unit>('unit');

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const createUnit = async (name: string, context: AuthorizationContext): Promise<Unit> => {
  const existing = await listUnits();
  if (existing.some((unit) => unit.active && sameName(unit.name, name))) {
    throw new Error(`There is already a unit called ${name.trim()}`);
  }
  const unitId = newId('unit');
  return insertRecord<Unit>(context, 'unit:manage', 'unit', {
    ...envelope(context),
    id: unitId,
    type: 'unit',
    unitId,
    name: name.trim(),
    active: true,
  });
};

/** Retired by flag, never deleted: past handoffs still name the unit (SCHEMA.md §6). */
export const setUnitActive = (unit: Unit, active: boolean, context: AuthorizationContext) =>
  updateRecord<Unit>(context, 'unit:manage', 'unit', unit.id, { active });
