import { describe, expect, it } from 'vitest';
import { Location } from '@shared';
import { nextPlaceNumber, placeBatchProblem, planPlaces } from './placeBatch';

const env = { facilityId: 'QA-PHC', deviceId: 'device:qa', createdBy: 'staff:qa', createdOn: '2026-11-15T09:00:00Z', schemaVersion: 4 };
const place = (id: string, name: string, kind: Location['kind'], parentId?: string, active = true) =>
  Location.parse({ ...env, id, type: 'location', name, kind, active, revision: 1, ...(parentId ? { parentId } : {}) });
const ward = place('location:ward', 'Male Medical Ward', 'ward');
const other = place('location:other', 'Female Ward', 'ward');

describe('place batches', () => {
  it('numbers a new ward from 1', () => {
    expect(nextPlaceNumber('Bed', ward.id, [ward])).toBe(1);
    expect(planPlaces({ prefix: 'Bed', count: 4, start: 1, parentId: ward.id, locations: [ward] }).map((p) => p.name)).toEqual(['Bed 1', 'Bed 2', 'Bed 3', 'Bed 4']);
  });
  it('continues numbering inside the same parent only', () => {
    const locations = [ward, other, place('b1', 'Bed 1', 'bed', ward.id), place('b6', 'bed  6', 'bed', ward.id), place('x9', 'Bed 9', 'bed', other.id)];
    expect(nextPlaceNumber('Bed', ward.id, locations)).toBe(7);
    expect(nextPlaceNumber('Bed', other.id, locations)).toBe(10);
    expect(nextPlaceNumber('Room', ward.id, locations)).toBe(1);
  });
  it('flags names already used by an active place in the same parent', () => {
    const locations = [ward, place('b2', 'Bed 2', 'bed', ward.id), place('b3', 'Bed 3', 'bed', ward.id, false), place('o1', 'Bed 1', 'bed', other.id)];
    expect(planPlaces({ prefix: ' bed ', count: 3, start: 1, parentId: ward.id, locations }).map((p) => [p.name, p.exists])).toEqual([['bed 1', false], ['bed 2', true], ['bed 3', false]]);
  });
  it('treats places without a parent as siblings of each other', () => {
    const locations = [place('r1', 'Room 1', 'room')];
    expect(planPlaces({ prefix: 'Room', count: 2, start: 1, locations }).map((p) => p.exists)).toEqual([true, false]);
  });
  it('refuses counts and starts that cannot be planned', () => {
    expect(placeBatchProblem(0, 1)).toBeDefined();
    expect(placeBatchProblem(101, 1)).toBeDefined();
    expect(placeBatchProblem(2.5, 1)).toBeDefined();
    expect(placeBatchProblem(4, -1)).toBeDefined();
    expect(placeBatchProblem(100, 0)).toBeUndefined();
  });
});
