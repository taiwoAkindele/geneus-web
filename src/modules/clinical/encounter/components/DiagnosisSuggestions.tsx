import { useEffect, useState } from 'react';
import type { ClinicalEvent, EncounterEntry } from '@shared';
import { allWhere } from '@/data/db';

export const DIAGNOSIS_LIST_ID = 'geneus-diagnosis-names';
export type KnownDiagnosis = { label: string; code?: string; codingSystem?: 'ICD-10' | 'SNOMED CT' | 'local'; uses: number };

/**
 * Diagnoses this facility has already recorded (visit diagnoses and problem
 * list), most used first, with the code they were last recorded with. No
 * external terminology is implied; a full ICD list can be imported later.
 */
export const facilityDiagnoses = (entries: readonly EncounterEntry[], problems: readonly ClinicalEvent[]): KnownDiagnosis[] => {
  const known = new Map<string, KnownDiagnosis>();
  const add = (label: unknown, code?: unknown, codingSystem?: unknown) => {
    if (typeof label !== 'string' || !label.trim()) return;
    const key = label.trim().toLowerCase();
    const current = known.get(key) ?? { label: label.trim(), uses: 0 };
    current.uses += 1;
    if (typeof code === 'string' && code.trim()) { current.code = code.trim(); current.codingSystem = codingSystem === 'ICD-10' || codingSystem === 'SNOMED CT' || codingSystem === 'local' ? codingSystem : current.codingSystem; }
    known.set(key, current);
  };
  for (const entry of entries) {
    const lines = entry.values.diagnoses as { label?: unknown; code?: unknown; codingSystem?: unknown }[] | undefined;
    if (lines?.length) for (const line of lines) add(line.label, line.code, line.codingSystem);
    else add(entry.values.diagnosis);
  }
  for (const problem of problems) add(problem.values.label, problem.values.code, problem.values.codingSystem);
  return [...known.values()].sort((a, b) => b.uses - a.uses || a.label.localeCompare(b.label));
};

/** Read once when the diagnosis section opens; suggestions do not need live updates. */
export const useDiagnosisSuggestions = (enabled: boolean): KnownDiagnosis[] => {
  const [known, setKnown] = useState<KnownDiagnosis[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    Promise.all([allWhere<EncounterEntry>('encounter_entry', 'step', 'diagnosis'), allWhere<ClinicalEvent>('clinical_event', 'kind', 'problem')])
      .then(([entries, problems]) => { if (active) setKnown(facilityDiagnoses(entries, problems).slice(0, 500)); })
      .catch(() => { /* Suggestions are optional; typing still works. */ });
    return () => { active = false; };
  }, [enabled]);
  return known;
};

export const DiagnosisSuggestions = ({ known }: { known: readonly KnownDiagnosis[] }) =>
  <datalist id={DIAGNOSIS_LIST_ID}>{known.map((item) => <option key={item.label} value={item.label}>{item.code ? `${item.code} · ${item.codingSystem ?? 'code'}` : undefined}</option>)}</datalist>;

/** The known code for an exact (case-insensitive) diagnosis match. */
export const knownCode = (known: readonly KnownDiagnosis[], label: string) => known.find((item) => item.label.toLowerCase() === label.trim().toLowerCase() && item.code);
