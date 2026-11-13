import { normalizeHeader } from './mapping';

/**
 * Matches a row to one of the hospital's own records. Only an identifier, a
 * recorded code, or an identical name (after ignoring case and punctuation)
 * is an exact match, and only when exactly one record has it. Anything else
 * is at most a suggestion, which a person must confirm.
 */
export type MatchCandidate = { id: string; name: string; codes?: readonly string[] };
export type Match =
  | { kind: 'exact'; id: string; by: 'id' | 'code' | 'name' }
  | { kind: 'suggested'; options: { id: string; score: number }[] }
  | { kind: 'none' };

export const normalizeName = normalizeHeader;
const bigrams = (value: string) => { const s = ` ${value} `; const grams = new Map<string, number>(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); grams.set(g, (grams.get(g) ?? 0) + 1); } return grams; };
const dice = (a: Map<string, number>, b: Map<string, number>, sizeA: number, sizeB: number) => {
  let overlap = 0; for (const [g, n] of a) overlap += Math.min(n, b.get(g) ?? 0);
  return sizeA + sizeB ? (2 * overlap) / (sizeA + sizeB) : 0;
};

export type MatchIndex = ReturnType<typeof matchIndex>;
export const matchIndex = (candidates: readonly MatchCandidate[]) => {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const byCode = new Map<string, string[]>(); const byName = new Map<string, string[]>();
  const add = (map: Map<string, string[]>, key: string, id: string) => { if (key) map.set(key, [...(map.get(key) ?? []), id]); };
  const grams = candidates.map((c) => { const n = normalizeName(c.name); const g = bigrams(n); return { id: c.id, grams: g, size: n.length + 1 }; });
  for (const c of candidates) { add(byName, normalizeName(c.name), c.id); for (const code of c.codes ?? []) add(byCode, normalizeName(code), c.id); }
  return { byId, byCode, byName, grams };
};

export const SUGGESTION_THRESHOLD = 0.55;

export const matchRecord = (index: MatchIndex, row: { id?: string; code?: string; name?: string }): Match => {
  if (row.id && index.byId.has(row.id.trim())) return { kind: 'exact', id: row.id.trim(), by: 'id' };
  const code = row.code ? index.byCode.get(normalizeName(row.code)) : undefined;
  if (code?.length === 1) return { kind: 'exact', id: code[0], by: 'code' };
  const name = row.name ? normalizeName(row.name) : '';
  const named = name ? index.byName.get(name) : undefined;
  if (named?.length === 1) return { kind: 'exact', id: named[0], by: 'name' };
  if (!name) return named?.length || code?.length ? { kind: 'suggested', options: [...new Set([...(code ?? []), ...(named ?? [])])].map((id) => ({ id, score: 1 })) } : { kind: 'none' };
  const g = bigrams(name), size = name.length + 1;
  const options = index.grams.map((c) => ({ id: c.id, score: dice(g, c.grams, size, c.size) })).filter((o) => o.score >= SUGGESTION_THRESHOLD).sort((a, b) => b.score - a.score).slice(0, 3);
  for (const id of [...(code ?? []), ...(named ?? [])].reverse()) if (!options.some((o) => o.id === id)) options.unshift({ id, score: 1 });
  return options.length ? { kind: 'suggested', options } : { kind: 'none' };
};
