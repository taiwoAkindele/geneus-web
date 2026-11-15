import { describe, expect, it } from 'vitest';
import type { CoverCheck, CoverSchedule, PatientCover } from '@shared';
import { plansOf } from '@/data/repos/insurance';
import { coverIssue, emptyCover } from './InsuranceAtCare';
import { coverStatus } from './CoverCard';
import { remittanceRows } from './PayerPaymentsScreen';
import { catalogueLines } from './DiagnosisCatalogue';

// Synthetic payers, plans and amounts only.
const cover = (patch: Partial<PatientCover> = {}) => ({ id: 'cover:1', patientId: 'P', payerId: 'payer:s', planCode: 'GOLD', enrolleeNumber: 'SYN-1', relationship: 'principal', active: true, ...patch }) as PatientCover;
const check = (patch: Partial<CoverCheck>) => ({ id: 'check:1', coverId: 'cover:1', result: 'verified', coversFrom: '2026-11-14', coversTo: '2026-11-14', ...patch }) as CoverCheck;

describe('insured registration', () => {
  it('needs payer, plan and enrollee number; a dependant names the principal', () => {
    expect(coverIssue(emptyCover())).toBe('Choose the payer');
    expect(coverIssue({ ...emptyCover(), payerId: 'payer:s' })).toBe('Choose or type the plan');
    expect(coverIssue({ ...emptyCover(), payerId: 'payer:s', planCode: 'GOLD' })).toBe('Enter the enrollee number');
    expect(coverIssue({ ...emptyCover(), payerId: 'payer:s', planCode: 'GOLD', enrolleeNumber: 'X', relationship: 'dependant' })).toMatch(/principal/);
    expect(coverIssue({ ...emptyCover(), payerId: 'payer:s', planCode: 'GOLD', enrolleeNumber: 'X', validFrom: '2026-12-01', validTo: '2026-01-01' })).toMatch(/end on or after/);
    expect(coverIssue({ ...emptyCover(), payerId: 'payer:s', planCode: 'GOLD', enrolleeNumber: 'X' })).toBeUndefined();
  });
  it('offers the plans of the payer\'s current contracts, never an ended one', () => {
    const schedules = [
      { payerId: 'payer:s', planCode: 'GOLD', planName: 'Gold' }, { payerId: 'payer:s', planCode: 'GOLD', planName: 'Gold' },
      { payerId: 'payer:s', planCode: 'OLD', planName: 'Old', endedOn: '2026-01-01' }, { payerId: 'payer:t', planCode: 'BRONZE', planName: 'Bronze' },
    ] as CoverSchedule[];
    expect(plansOf('payer:s', schedules)).toEqual([{ code: 'GOLD', name: 'Gold' }]);
  });
  it('never calls cover verified without a check covering today', () => {
    const today = '2026-11-14';
    expect(coverStatus(cover(), undefined, today)).toBe('Not yet verified');
    expect(coverStatus(cover(), check({}), today)).toBe('Verified for today');
    expect(coverStatus(cover(), check({ coversFrom: '2026-11-01', coversTo: '2026-11-02' }), today)).toMatch(/not checked for today/);
    expect(coverStatus(cover(), check({ result: 'pending' }), today)).toMatch(/pending/);
    expect(coverStatus(cover(), check({ result: 'not_eligible' }), today)).toMatch(/Not eligible/);
    expect(coverStatus(cover({ validTo: '2026-10-31' }), check({}), today)).toBe('Expired on 2026-10-31');
    expect(coverStatus(cover({ enrolleeNumber: ' ' }), undefined, today)).toBe('Details incomplete');
    expect(coverStatus(cover({ active: false }), check({}), today)).toBe('Inactive');
  });
});

describe('payment advice rows', () => {
  it('reads amounts in minor units, skips blank rows, and leaves unreadable amounts out', () => {
    const rows = remittanceRows([
      { sourceRow: 2, values: { claimNumber: ' CLM-000001 ', paidAmount: '3,600.00', approvedAmount: '3600', reason: '' } },
      { sourceRow: 3, values: { claimNumber: '', paidAmount: '' } },
      { sourceRow: 4, values: { enrolleeNumber: 'SYN-9', paidAmount: 'twelve' } },
    ]);
    expect(rows).toEqual([
      { sourceRow: 2, claimNumber: 'CLM-000001', approvedMinor: 360_000, paidMinor: 360_000 },
      { sourceRow: 4, enrolleeNumber: 'SYN-9' },
    ]);
  });
});

describe('diagnosis code list rows', () => {
  it('keeps code and description, and skips empty rows', () => {
    expect(catalogueLines([{ sourceRow: 2, values: { code: ' B54 ', description: 'Unspecified malaria' } }, { sourceRow: 3, values: { code: '', description: '' } }]))
      .toEqual([{ code: 'B54', description: 'Unspecified malaria', sourceRow: 2 }]);
  });
});
