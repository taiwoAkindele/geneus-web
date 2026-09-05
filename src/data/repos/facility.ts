import type { Facility } from '@shared';
import { allOfType } from '../db';

/**
 * One facility per device: its code is the facilityId stamped on every
 * document. The document itself is created by the server at registration and
 * replicated down — never written here.
 */
export const getFacility = async (): Promise<Facility | undefined> => (await allOfType<Facility>('facility'))[0];

/** Suggests OOE-PHC from "Odo-Ona Elewe PHC" — initials, then any trailing acronym. */
export const suggestCode = (name: string): string => {
  const words = name.trim().split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return '';
  const isAcronym = (word: string) => word.length <= 4 && word === word.toUpperCase();
  const tail = words.filter(isAcronym);
  const head = words.filter((word) => !isAcronym(word));
  const initials = head.map((word) => word[0]?.toUpperCase() ?? '').join('');
  return [initials, ...tail.map((word) => word.toUpperCase())].filter(Boolean).join('-');
};
