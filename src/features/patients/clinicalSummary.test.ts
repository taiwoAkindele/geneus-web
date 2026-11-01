import { describe, expect, it } from 'vitest';
import type { ClinicalEvent, Patient } from '@shared';
import type { PatientDirectoryRow } from '@/data/repos/patientDirectory';
import type { EncounterSummary } from '@/features/encounter/encounterSummary';
import { summariseClinicalRows } from './clinicalSummary';

const patient = (id: string, allergies: string[] = []) => ({ id, patientId: id, fullName: id, allergies, createdOn: '2026-10-01T08:00:00Z' }) as unknown as Patient;
const row = (id: string, extra: Partial<PatientDirectoryRow> = {}): PatientDirectoryRow => ({ patient: patient(id), ids: [id], searchRecords: [patient(id)], ...extra });
const event = (id: string, patientId: string, kind: ClinicalEvent['kind'], values: Record<string, unknown>, previousId?: string) => ({ id, recordId: previousId ?? id, previousId, patientId, kind, values, facilityId: 'TEST' }) as unknown as ClinicalEvent;
const visit = (id: string, patientId: string, openedOn: string, status: EncounterSummary['status'] = 'Open') => ({ id, patientId, openedOn, status }) as EncounterSummary;
const stay = { encounterId: 'v', status: 'arrive', ward: 'Main ward', bed: 'Bed 01', team: 'Ward team', attending: [], pending: false, admittedOn: '2026-10-31T08:00:00Z' };

describe('clinical patients table', () => {
  it('shows admitted, a visit in progress today, an unfinished visit from an earlier day, or not admitted', () => {
    const summaries = summariseClinicalRows([row('A'), row('B'), row('C'), row('D', { stay })], [], [
      visit('a1', 'A', '2026-11-01T09:12:00'), visit('b1', 'B', '2026-10-30T07:32:00'), visit('c1', 'C', '2026-10-30T07:10:00', 'Closed'), visit('d1', 'D', '2026-10-31T08:00:00'),
    ], '2026-11-01');
    expect(summaries.get('A')).toMatchObject({ status: 'in_progress', openVisit: { id: 'a1' } });
    expect(summaries.get('B')).toMatchObject({ status: 'unfinished', openVisit: { id: 'b1' } });
    expect(summaries.get('C')?.status).toBe('not_admitted');
    expect(summaries.get('D')?.status).toBe('admitted');
  });
  it('lists current active problems and merged allergies, most severe first, across linked records', () => {
    const linked = { ...row('A', { ids: ['A', 'A2'] }), searchRecords: [patient('A', ['Latex', 'Penicillin'])] };
    const summary = summariseClinicalRows([linked], [
      event('p1', 'A', 'problem', { label: 'Hypertension', status: 'active', certainty: 'confirmed' }),
      event('p2', 'A2', 'problem', { label: 'Malaria', status: 'active', certainty: 'suspected' }),
      event('p3', 'A', 'problem', { label: 'Old fracture', status: 'active', certainty: 'confirmed' }),
      event('p3b', 'A', 'problem', { label: 'Old fracture', status: 'resolved', certainty: 'confirmed' }, 'p3'),
      event('a1', 'A', 'allergy', { allergen: 'Penicillin', reaction: 'Rash', severity: 'severe', verification: 'confirmed', status: 'active' }),
      event('a2', 'A', 'allergy', { allergen: 'Sulfa', reaction: 'Hives', severity: 'moderate', verification: 'reported', status: 'active' }),
    ], [], '2026-11-01').get('A')!;
    expect(summary.problems.sort()).toEqual(['Hypertension', 'Malaria']);
    expect(summary.allergies).toEqual([{ allergen: 'Penicillin', severity: 'severe' }, { allergen: 'Sulfa', severity: 'moderate' }, { allergen: 'Latex', severity: 'unknown' }]);
  });
});
