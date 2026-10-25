import { canonicalPatientId, type Patient, type PatientIdentityEvent } from '@shared';
import { findLikelyMatches } from '@/features/search/patientMatching';

export const identityPairKey = (a: string, b: string): string => [a, b].sort().join('|');
export type IdentityCandidate = { patient: Patient; other: Patient; reason: string };

/** Candidate discovery suggests review; it never establishes identity. */
export const identityCandidates = (patients: readonly Patient[], events: readonly PatientIdentityEvent[], limit = 100): IdentityCandidate[] => {
  const latest = new Map<string, PatientIdentityEvent>();
  for (const event of [...events].sort((a, b) => (a.revision ?? Number.MAX_SAFE_INTEGER) - (b.revision ?? Number.MAX_SAFE_INTEGER))) {
    if (event.otherPatientId) latest.set(identityPairKey(event.patientId, event.otherPatientId), event);
  }
  const candidates = new Map<string, IdentityCandidate>();
  const byId = new Map(patients.map((p) => [p.patientId, p]));
  const add = (patient: Patient, other: Patient, reason: string) => {
    if (canonicalPatientId(patient.id, events) === canonicalPatientId(other.id, events)) return;
    const key = identityPairKey(patient.id, other.id);
    if (['distinct', 'registration_distinct'].includes(latest.get(key)?.outcome ?? '')) return;
    candidates.set(key, { patient, other, reason });
  };
  for (const event of latest.values()) if (event.outcome === 'review_requested') {
    const patient = byId.get(event.patientId), other = byId.get(event.otherPatientId ?? '');
    if (patient && other) add(patient, other, `Flagged for review: ${event.reason}`);
  }
  // An inverted name index avoids comparing every patient with every other one.
  const buckets = new Map<string, Patient[]>();
  for (const patient of patients) {
    const keys = new Set(patient.fullName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z]+/).filter(Boolean).map((token) => token.slice(0, 3)));
    const pool = [...new Map([...keys].flatMap((key) => buckets.get(key) ?? []).map((p) => [p.id, p])).values()];
    if (candidates.size < limit) for (const match of findLikelyMatches(patient, pool)) {
      add(patient, match.patient, `Possible match: ${match.reasons.join(', ')}`);
      if (candidates.size >= limit) break;
    }
    for (const key of keys) { const bucket = buckets.get(key) ?? []; bucket.push(patient); buckets.set(key, bucket); }
  }
  return [...candidates.values()].slice(0, limit);
};
