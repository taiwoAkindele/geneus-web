import { describe, expect, it } from 'vitest';
import { sectionState, shownValue, visitContextSteps } from './visitSoFar';
import type { StepKey } from './types';

const consultation: StepKey[] = [
  'vitals',
  'complaint',
  'investigation_review',
  'lab_order',
  'lab_results',
  'result_review',
  'diagnosis',
  'prescription',
  'injection_order',
  'disposition',
  'dispense',
];
const signature = { actor: 'Dr A', role: 'doctor', time: '09:00', date: '15 Nov 2026' };

describe('visit so far', () => {
  it('shows nothing before the first section', () => {
    expect(visitContextSteps(consultation, 'vitals')).toEqual([]);
  });
  it('shows the earlier sections, without the testing decision once tests are ordered', () => {
    expect(visitContextSteps(consultation, 'diagnosis')).toEqual([
      'vitals',
      'complaint',
      'lab_order',
      'lab_results',
      'result_review',
    ]);
    expect(
      visitContextSteps(['vitals', 'complaint', 'investigation_review', 'diagnosis'], 'diagnosis'),
    ).toEqual(['vitals', 'complaint', 'investigation_review']);
  });
  it('gives treatment tasks only the decision they carry out', () => {
    expect(visitContextSteps(consultation, 'dispense')).toEqual(['diagnosis', 'prescription']);
    expect(visitContextSteps(consultation, 'lab_results')).toEqual(['complaint', 'lab_order']);
  });
  it('tells signed, draft, skipped and missing sections apart', () => {
    const blank = [{ label: 'Complaints', value: '—' }];
    expect(sectionState({ sig: { vitals: signature }, skipped: [] }, 'vitals', blank, blank)).toBe(
      'signed',
    );
    expect(
      sectionState(
        { sig: {}, skipped: [] },
        'complaint',
        [{ label: 'Complaints', value: 'Cough for 3 days' }],
        blank,
      ),
    ).toBe('draft');
    expect(sectionState({ sig: {}, skipped: ['lab_results'] }, 'lab_results', blank, blank)).toBe(
      'skipped',
    );
    expect(sectionState({ sig: {}, skipped: [] }, 'complaint', blank, blank)).toBe('not_recorded');
  });
  it('does not treat an untouched form default as a draft', () => {
    const untouched = [{ label: 'Injection order', value: 'No injection ordered' }];
    expect(sectionState({ sig: {}, skipped: [] }, 'injection_order', untouched, untouched)).toBe(
      'not_recorded',
    );
  });
  it('keeps documented negatives and marks blanks as not recorded', () => {
    expect(shownValue('—')).toBe('Not recorded');
    expect(shownValue('No medication required')).toBe('No medication required');
  });
});
