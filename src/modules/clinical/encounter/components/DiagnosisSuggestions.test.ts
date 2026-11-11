import { describe, expect, it } from 'vitest';
import type { ClinicalEvent, EncounterEntry } from '@shared';
import { facilityDiagnoses, knownCode } from './DiagnosisSuggestions';

const entry = (values: Record<string, unknown>) => ({ values }) as unknown as EncounterEntry;
const problem = (values: Record<string, unknown>) => ({ values }) as unknown as ClinicalEvent;

describe('facility diagnosis suggestions', () => {
  const known = facilityDiagnoses([
    entry({ diagnosis: 'Malaria', diagnoses: [{ label: 'Malaria', code: 'B54', codingSystem: 'ICD-10' }] }),
    entry({ diagnosis: 'malaria' }),
    entry({ diagnosis: 'Hypertension' }),
  ], [problem({ label: 'Hypertension', code: 'I10', codingSystem: 'ICD-10' })]);

  it('merges spellings, counts use and keeps the recorded code', () => {
    expect(known.map((item) => [item.label, item.uses, item.code])).toEqual([['Hypertension', 2, 'I10'], ['Malaria', 2, 'B54']]);
  });
  it('fills a code only for an exact known diagnosis', () => {
    expect(knownCode(known, ' MALARIA ')?.code).toBe('B54');
    expect(knownCode(known, 'Malaria, severe')).toBeUndefined();
  });
});
