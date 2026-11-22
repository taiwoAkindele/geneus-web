/** The classes for a step that is signed (locked), being worked on (active), or neither (idle). */
export const stepTone = (
  locked: boolean,
  active: boolean,
  tones: { locked: string; active: string; idle: string },
): string => {
  if (locked) {
    return tones.locked;
  }

  if (active) {
    return tones.active;
  }

  return tones.idle;
};
