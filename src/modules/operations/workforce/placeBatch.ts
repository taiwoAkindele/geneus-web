import type { Location } from '@shared';

/** Enough for the largest ward or building floor; a bigger batch is almost always a typo. */
export const MAX_PLACES_PER_BATCH = 100;

export type PlannedPlace = {
  /** Position in the batch; it fixes the record id, so a resumed batch never creates the same place twice. */
  index: number;
  name: string;
  /** An active place with this name is already inside the same parent. */
  exists: boolean;
};

const normalized = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const siblings = (locations: readonly Location[], parentId: string | undefined) =>
  locations.filter((l) => l.active && (l.parentId ?? '') === (parentId ?? ''));

/** One after the highest "<prefix> N" already inside the parent, so adding beds to a ward continues its numbering. */
export const nextPlaceNumber = (
  prefix: string,
  parentId: string | undefined,
  locations: readonly Location[],
): number => {
  const pattern = new RegExp(`^${escapeRegExp(normalized(prefix))} (\\d+)$`);
  const numbers = siblings(locations, parentId)
    .map((l) => pattern.exec(normalized(l.name))?.[1])
    .filter(Boolean)
    .map(Number);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
};

/** The places a batch would create, named "<prefix> <start>", "<prefix> <start + 1>", … */
export const planPlaces = (input: {
  prefix: string;
  count: number;
  start: number;
  parentId?: string;
  locations: readonly Location[];
}): PlannedPlace[] => {
  const taken = new Set(siblings(input.locations, input.parentId).map((l) => normalized(l.name)));
  const prefix = input.prefix.trim().replace(/\s+/g, ' ');
  return Array.from({ length: input.count }, (_, index) => {
    const name = `${prefix} ${input.start + index}`;
    return { index, name, exists: taken.has(normalized(name)) };
  });
};

/** Why a batch cannot be planned, or undefined when it can. */
export const placeBatchProblem = (count: number, start: number): string | undefined => {
  if (!Number.isInteger(count) || count < 1 || count > MAX_PLACES_PER_BATCH) {
    return `Choose between 1 and ${MAX_PLACES_PER_BATCH} places`;
  }
  if (!Number.isInteger(start) || start < 0) {
    return 'Start numbering at a whole number, 0 or more';
  }
  return undefined;
};
