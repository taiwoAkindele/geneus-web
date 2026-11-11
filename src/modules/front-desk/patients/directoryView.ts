import { calendarDate } from '@/lib/calendarDate';
import { formatMoney } from '@/lib/money';
import type { ChargeBalance } from '@/data/repos/billing';
import type { PatientDirectoryRow } from '@/data/repos/patientDirectory';

type Row = Pick<PatientDirectoryRow, 'ids' | 'lastVisit' | 'todayBooking'>;

/** Where the patient stands today at the desk, from their visit and booking; undefined when not expected today. */
export const todayStatus = (row: Row, now = new Date()): string | undefined => {
  const today = calendarDate(now);
  if (row.lastVisit && calendarDate(row.lastVisit.openedOn) === today) return 'Visit in progress today';
  if (row.todayBooking?.attendance === 'arrived') return 'Arrived';
  if (row.todayBooking) {
    const at = row.todayBooking.scheduledFor;
    return at ? `Expected ${new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Booked for now';
  }
  return undefined;
};

/** Outstanding amounts across all of a patient's linked IDs, one entry per currency. */
export const balanceOwed = (row: Pick<Row, 'ids'>, balances: readonly ChargeBalance[]): string[] => {
  const totals = new Map<string, number>();
  for (const { charge, balanceMinor } of balances) {
    if (balanceMinor > 0 && row.ids.includes(charge.patientId)) totals.set(charge.currency, (totals.get(charge.currency) ?? 0) + balanceMinor);
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, amount]) => formatMoney(amount, currency));
};
