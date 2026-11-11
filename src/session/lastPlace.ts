/**
 * Where a signed-in member of staff was working, so signing back in after the
 * inactivity timeout returns them to the same patient or task.
 *
 * Held in memory only: never written to browser storage, never shown to a
 * different member of staff, and used at most once.
 */
type Place = { staffId: string; facilityId: string; path: string };
let last: Place | undefined;

const NOT_A_PLACE = /^\/(login|onboarding|home$)/;

export const rememberPlace = (staffId: string, facilityId: string, path: string): void => {
  if (NOT_A_PLACE.test(path)) return;
  last = { staffId, facilityId, path };
};

/** The remembered path for exactly this person at this facility; cleared once read. */
export const takePlace = (staffId: string | null | undefined, facilityId: string): string | undefined => {
  const place = last;
  last = undefined;
  return place && staffId && place.staffId === staffId && place.facilityId === facilityId ? place.path : undefined;
};
