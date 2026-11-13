import { useLiveQuery } from '@/data';
import { listPatients } from '@/data/repos/patients';
import { listStaff } from '@/data/repos/staff';
import { listAdjustments, listBillingDepartments, listCharges, listFeeItems, listIncomingTransfers, listPayments, type BalanceCoverage } from '@/data/repos/billing';
import { estimatesFor, loadCoverage, type CoverageData } from '@/data/repos/insurance';

const loadBilling = async () => {
  const [charges, payments, adjustments, transfers, fees, patients, staff, departments] = await Promise.all([
    listCharges(), listPayments(), listAdjustments(), listIncomingTransfers(), listFeeItems(), listPatients(), listStaff(), listBillingDepartments(),
  ]);
  // Insurance and refunds: empty for a hospital without insurance, so every charge stays a cash bill.
  const insurance: CoverageData = await loadCoverage(charges);
  const coverage: BalanceCoverage = { estimates: estimatesFor(charges, insurance), refunds: insurance.refunds };
  return { charges, payments, adjustments, transfers, fees, patients, staff, departments, insurance, coverage };
};
export const useBilling = () => useLiveQuery(loadBilling);
export type BillingData = Awaited<ReturnType<typeof loadBilling>>;
