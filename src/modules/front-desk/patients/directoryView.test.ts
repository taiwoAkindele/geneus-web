import { describe, expect, it } from 'vitest';
import type { Charge, Encounter } from '@shared';
import { formatMoney } from '@/lib/money';
import type { ChargeBalance } from '@/data/repos/billing';
import { balanceOwed, todayStatus } from './directoryView';

const now = new Date(2026, 10, 9, 10);
const at = (day: number, hour = 9) => new Date(2026, 10, day, hour).toISOString();
const visit = (day: number) => ({ openedOn: at(day) }) as Encounter;
const balance = (patientId: string, balanceMinor: number, currency = 'NGN'): ChargeBalance => ({ charge: { patientId, currency } as Charge, balanceMinor, settledMinor: 0, discountMinor: 0, waivedMinor: 0, dueMinor: balanceMinor, refundedMinor: 0, undeterminedMinor: 0, estimated: false, final: true });

describe('patient list: today at the desk', () => {
  it('prefers a visit opened today over the booking', () => {
    expect(todayStatus({ ids: ['p1'], lastVisit: visit(9), todayBooking: { attendance: 'arrived', createdOn: at(9) } }, now)).toBe('Visit in progress today');
  });

  it('shows arrival, an expected time, or a booking for now', () => {
    expect(todayStatus({ ids: ['p1'], todayBooking: { attendance: 'arrived', createdOn: at(9) } }, now)).toBe('Arrived');
    expect(todayStatus({ ids: ['p1'], todayBooking: { attendance: 'booked', scheduledFor: at(9, 14), createdOn: at(1) } }, now)).toMatch(/^Expected 14:00$/);
    expect(todayStatus({ ids: ['p1'], todayBooking: { attendance: undefined, createdOn: at(9) } }, now)).toBe('Booked for now');
  });

  it('is empty for a patient last seen on another day with no booking today', () => {
    expect(todayStatus({ ids: ['p1'], lastVisit: visit(2) }, now)).toBeUndefined();
  });
});

describe('patient list: balance owed', () => {
  it('adds outstanding charges across linked IDs, per currency, ignoring settled ones and other patients', () => {
    const owed = balanceOwed({ ids: ['p1', 'p1-alias'] }, [balance('p1', 200000), balance('p1-alias', 150000), balance('p1', 0), balance('p2', 999), balance('p1', 500, 'USD')]);
    expect(owed).toEqual([formatMoney(350000, 'NGN'), formatMoney(500, 'USD')]);
  });

  it('is empty when nothing is owed', () => {
    expect(balanceOwed({ ids: ['p1'] }, [balance('p1', 0)])).toEqual([]);
  });
});
