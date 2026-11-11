import { useLiveQuery } from '@/data';
import { listPatients } from '@/data/repos/patients';
import { listStaff } from '@/data/repos/staff';
import { listAdjustments, listBillingDepartments, listCharges, listFeeItems, listIncomingTransfers, listPayments } from '@/data/repos/billing';

const loadBilling = async () => {
  const [charges, payments, adjustments, transfers, fees, patients, staff, departments] = await Promise.all([
    listCharges(), listPayments(), listAdjustments(), listIncomingTransfers(), listFeeItems(), listPatients(), listStaff(), listBillingDepartments(),
  ]);
  return { charges, payments, adjustments, transfers, fees, patients, staff, departments };
};
export const useBilling = () => useLiveQuery(loadBilling);
export type BillingData = Awaited<ReturnType<typeof loadBilling>>;
