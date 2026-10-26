import type { AuthorizationContext, BillingAdjustment, Charge, Encounter, EncounterEntry, Patient, Payment } from '@shared';
import { summariseEncounter } from '@/features/encounter/encounterSummary';
import { chargeBalances } from '@/data/repos/billing';
import { calendarDate } from '@/lib/calendarDate';
import { navigationFor, hasAdminWorkspace } from '@/app/navigation';

export const dashboardAccess = (context: Pick<AuthorizationContext, 'role' | 'roles' | 'permissions'>) => {
  const navigation = navigationFor(context);
  const roles = context.roles ?? [context.role];
  return {
    care: roles.some((role) => ['chew', 'nurse', 'doctor', 'supervisor'].includes(role)) || context.permissions.includes('encounter:record'),
    appointments: navigation.some((item) => item.key === 'appointments'),
    billing: navigation.some((item) => item.key === 'billing'),
    facility: hasAdminWorkspace(context),
    stock: navigation.some((item) => item.key === 'stock'),
  };
};

export const careSnapshot = (encounters: readonly Encounter[], entries: readonly EncounterEntry[], patients: readonly Patient[], today: string) => {
  const byEncounter = new Map<string, EncounterEntry[]>();
  for (const entry of entries) {
    const group = byEncounter.get(entry.encounterId) ?? [];
    group.push(entry); byEncounter.set(entry.encounterId, group);
  }
  const names = new Map(patients.map((patient) => [patient.patientId, patient.fullName]));
  const visits = encounters.map((encounter) => ({ ...summariseEncounter(encounter, byEncounter.get(encounter.id) ?? []), patientName: names.get(encounter.patientId) ?? encounter.patientId }));
  return {
    today: visits.filter((visit) => calendarDate(visit.openedOn) === today).length,
    // Open visits are unfinished work, not proof that a patient is physically waiting.
    open: visits.filter((visit) => visit.status === 'Open').sort((a, b) => a.openedOn.localeCompare(b.openedOn)),
  };
};

export const billingSnapshot = (charges: readonly Charge[], payments: readonly Payment[], adjustments: readonly BillingAdjustment[], patients: readonly Patient[], today: string) => {
  const names = new Map(patients.map((patient) => [patient.patientId, patient.fullName]));
  const accounts = new Map<string, { patientId: string; name: string; currency: string; outstanding: number; oldest: string }>();
  for (const row of chargeBalances(charges, payments, adjustments)) {
    if (row.balanceMinor <= 0) continue;
    const key = row.charge.patientId + '|' + row.charge.currency;
    const account = accounts.get(key) ?? { patientId: row.charge.patientId, name: names.get(row.charge.patientId) ?? row.charge.patientId, currency: row.charge.currency, outstanding: 0, oldest: row.charge.createdOn };
    account.outstanding += row.balanceMinor;
    if (row.charge.createdOn < account.oldest) account.oldest = row.charge.createdOn;
    accounts.set(key, account);
  }
  const collected = new Map<string, number>();
  for (const payment of payments) {
    if (payment.method === 'waiver' || calendarDate(payment.createdOn) !== today) continue;
    collected.set(payment.currency, (collected.get(payment.currency) ?? 0) + (payment.reverses ? -payment.amountMinor : payment.amountMinor));
  }
  return { accounts: [...accounts.values()].sort((a, b) => a.oldest.localeCompare(b.oldest)), collected: [...collected].sort(([a], [b]) => a.localeCompare(b)) };
};
