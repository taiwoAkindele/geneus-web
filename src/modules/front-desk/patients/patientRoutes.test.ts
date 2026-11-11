import { describe, expect, it } from 'vitest';
import { patientChartPath, resolvePatientTab } from './patientRoutes';
import { inPeriod } from './PatientHistory';

describe('patient record tabs', () => {
  it('reads current tab names', () => {
    expect(resolvePatientTab('now')).toEqual({ tab: 'now' });
    expect(resolvePatientTab('history')).toEqual({ tab: 'history' });
    expect(resolvePatientTab('details')).toEqual({ tab: 'details' });
  });

  it('opens former tabs in their new place so older links keep working', () => {
    expect(resolvePatientTab('overview')).toEqual({ tab: 'now' });
    expect(resolvePatientTab('ward')).toEqual({ tab: 'history', show: 'stays' });
    expect(resolvePatientTab('visits')).toEqual({ tab: 'history', show: 'visits' });
    expect(resolvePatientTab('appointments')).toEqual({ tab: 'history', show: 'appointments' });
    expect(resolvePatientTab('documents')).toEqual({ tab: 'history', show: 'documents' });
  });

  it('ignores absent or unknown values', () => {
    expect(resolvePatientTab(null)).toBeUndefined();
    expect(resolvePatientTab('nonsense')).toBeUndefined();
  });

  it('builds links with the new tab and history view', () => {
    expect(patientChartPath('P-1')).toBe('/patients/profile?patient=P-1&tab=now');
    expect(patientChartPath('P-1', 'visits', { visit: 'v1' })).toBe('/patients/profile?patient=P-1&tab=history&show=visits&visit=v1');
    expect(patientChartPath('P-1', 'ward', { admission: 'a1' })).toBe('/patients/profile?patient=P-1&tab=history&show=stays&admission=a1');
  });
});

describe('history period filter', () => {
  const now = new Date(2026, 10, 11, 12, 0);
  it('keeps everything for all dates', () => expect(inPeriod(new Date(2020, 0, 1).toISOString(), 'all', now)).toBe(true));
  it('matches only the local calendar day for today', () => {
    expect(inPeriod(new Date(2026, 10, 11, 0, 5).toISOString(), 'today', now)).toBe(true);
    expect(inPeriod(new Date(2026, 10, 10, 23, 55).toISOString(), 'today', now)).toBe(false);
  });
  it('includes the last 30 calendar days including today', () => {
    expect(inPeriod(new Date(2026, 9, 13, 9, 0).toISOString(), '30d', now)).toBe(true);
    expect(inPeriod(new Date(2026, 9, 12, 9, 0).toISOString(), '30d', now)).toBe(false);
  });
});
